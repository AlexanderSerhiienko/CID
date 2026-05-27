import { EventCategory, EventStatus, Severity, SourceType } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_TOKEN_HEADER } from "@/lib/auth/constants";

const mocks = vi.hoisted(() => ({
  prisma: {
    source: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    riskEvent: {
      update: vi.fn(),
      findMany: vi.fn()
    }
  },
  ingestRssSource: vi.fn(),
  mergeRiskEvent: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/pipeline/rss", () => ({
  ingestRssSource: mocks.ingestRssSource
}));

vi.mock("@/lib/review/merge", () => ({
  mergeRiskEvent: mocks.mergeRiskEvent
}));

import { PATCH as reviewPatch } from "@/app/api/admin/review/route";
import { POST as ingestPost } from "@/app/api/ingest/rss/route";
import { POST as sourcePost } from "@/app/api/sources/route";
import { PATCH as sourcePatch } from "@/app/api/sources/[id]/route";

describe("protected API route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_TOKEN = "dev-admin-token";
  });

  it("rejects source creation without admin token", async () => {
    const response = await sourcePost(jsonRequest("/api/sources", validSourcePayload()));

    await expect(response.json()).resolves.toEqual({ error: "Admin token required." });
    expect(response.status).toBe(401);
    expect(mocks.prisma.source.create).not.toHaveBeenCalled();
  });

  it("creates a source with a valid admin token", async () => {
    const source = { id: "source-1", ...validSourcePayload() };
    mocks.prisma.source.create.mockResolvedValue(source);

    const response = await sourcePost(
      jsonRequest("/api/sources", validSourcePayload(), { token: "dev-admin-token" })
    );

    await expect(response.json()).resolves.toEqual({ source });
    expect(response.status).toBe(201);
    expect(mocks.prisma.source.create).toHaveBeenCalledWith({
      data: validSourcePayload()
    });
  });

  it("updates a source with validated payload", async () => {
    const source = { id: "source-1", enabled: false, trustScore: 0.7 };
    mocks.prisma.source.update.mockResolvedValue(source);

    const response = await sourcePatch(
      jsonRequest("/api/sources/source-1", { enabled: false, trustScore: 0.7 }, { token: "dev-admin-token" }),
      { params: Promise.resolve({ id: "source-1" }) }
    );

    await expect(response.json()).resolves.toEqual({ source });
    expect(response.status).toBe(200);
    expect(mocks.prisma.source.update).toHaveBeenCalledWith({
      where: { id: "source-1" },
      data: { enabled: false, trustScore: 0.7 }
    });
  });

  it("rejects ingestion without admin token", async () => {
    const response = await ingestPost(jsonRequest("/api/ingest/rss", {}));

    await expect(response.json()).resolves.toEqual({ error: "Admin token required." });
    expect(response.status).toBe(401);
    expect(mocks.prisma.source.findMany).not.toHaveBeenCalled();
  });

  it("runs RSS ingestion for enabled sources with a valid admin token", async () => {
    mocks.prisma.source.findMany.mockResolvedValue([{ id: "source-1", name: "WHO", enabled: true }]);
    mocks.ingestRssSource.mockResolvedValue({ rawArticles: 2, candidateEvents: 1 });

    const response = await ingestPost(
      jsonRequest("/api/ingest/rss", {}, { token: "dev-admin-token" })
    );

    await expect(response.json()).resolves.toEqual({
      results: [
        {
          sourceId: "source-1",
          sourceName: "WHO",
          ok: true,
          result: { rawArticles: 2, candidateEvents: 1 }
        }
      ]
    });
    expect(response.status).toBe(200);
    expect(mocks.prisma.source.findMany).toHaveBeenCalledWith({ where: { enabled: true } });
    expect(mocks.ingestRssSource).toHaveBeenCalledWith("source-1");
  });

  it("approves a review event with a valid admin token", async () => {
    const event = { id: "event-1", status: EventStatus.PUBLISHED };
    mocks.prisma.riskEvent.update.mockResolvedValue(event);

    const response = await reviewPatch(
      jsonRequest(
        "/api/admin/review",
        {
          id: "event-1",
          action: "approve",
          patch: {
            severity: Severity.HIGH,
            category: EventCategory.NATURAL_DISASTER
          }
        },
        { token: "dev-admin-token" }
      )
    );

    await expect(response.json()).resolves.toEqual({ event });
    expect(response.status).toBe(200);
    expect(mocks.prisma.riskEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        severity: Severity.HIGH,
        category: EventCategory.NATURAL_DISASTER,
        status: EventStatus.PUBLISHED
      }
    });
  });

  it("rejects merge review action without target event id", async () => {
    const response = await reviewPatch(
      jsonRequest(
        "/api/admin/review",
        { id: "event-1", action: "merge" },
        { token: "dev-admin-token" }
      )
    );

    await expect(response.json()).resolves.toEqual({
      error: "targetEventId is required for merge."
    });
    expect(response.status).toBe(400);
    expect(mocks.mergeRiskEvent).not.toHaveBeenCalled();
  });
});

function validSourcePayload() {
  return {
    name: "Test Feed",
    url: "https://example.com/feed.xml",
    type: SourceType.RSS,
    enabled: true,
    trustScore: 0.6
  };
}

function jsonRequest(
  path: string,
  body: unknown,
  options: { token?: string } = {}
) {
  const headers = new Headers({ "content-type": "application/json" });

  if (options.token) {
    headers.set(ADMIN_TOKEN_HEADER, options.token);
  }

  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}
