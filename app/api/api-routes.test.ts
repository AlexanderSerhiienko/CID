import { EventCategory, EventStatus, Severity, SourceType } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_TOKEN_HEADER } from "@/lib/auth/constants";

const mocks = vi.hoisted(() => ({
  prisma: {
    source: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    riskEvent: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn()
    },
    rawArticle: {
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    $transaction: vi.fn()
  },
  tx: {
    riskEvent: {
      create: vi.fn()
    },
    rawArticle: {
      update: vi.fn()
    }
  },
  ingestSourcesWithTimeLimit: vi.fn(),
  mergeRiskEvent: vi.fn(),
  enrichPendingArticles: vi.fn(),
  enrichEvent: vi.fn(),
  extractEventFromArticle: vi.fn(),
  scoreCandidate: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/pipeline/timed-ingest", () => ({
  ingestSourcesWithTimeLimit: mocks.ingestSourcesWithTimeLimit,
  getContinueUrl: () => "http://localhost:3000/api/admin/ingest-continue"
}));

vi.mock("@/lib/review/merge", () => ({
  mergeRiskEvent: mocks.mergeRiskEvent
}));

vi.mock("@/lib/pipeline/ai-enrichment", () => ({
  enrichPendingArticles: mocks.enrichPendingArticles,
  enrichEvent: mocks.enrichEvent
}));

vi.mock("@/lib/pipeline/extraction", () => ({
  extractEventFromArticle: mocks.extractEventFromArticle
}));

vi.mock("@/lib/pipeline/scoring", () => ({
  scoreCandidate: mocks.scoreCandidate
}));

import { PATCH as reviewPatch } from "@/app/api/admin/review/route";
import { POST as ingestPost } from "@/app/api/ingest/rss/route";
import { POST as sourcePost } from "@/app/api/sources/route";
import { GET as eventsGet } from "@/app/api/events/route";
import { GET as eventGet } from "@/app/api/events/[id]/route";
import { POST as bulkApprovePost } from "@/app/api/admin/bulk-approve/route";
import { POST as processNextPost } from "@/app/api/admin/process-next/route";
import { POST as promoteArticlePost } from "@/app/api/admin/promote-article/route";
import { PATCH as sourcePatch } from "@/app/api/sources/[id]/route";

describe("protected API route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_TOKEN = "dev-admin-token";
    mocks.prisma.$transaction.mockImplementation((callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx));
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

  it("returns 404 when updating a source that does not exist", async () => {
    mocks.prisma.source.update.mockRejectedValue(new Error("Not found"));

    const response = await sourcePatch(
      jsonRequest("/api/sources/unknown", { enabled: false }, { token: "dev-admin-token" }),
      { params: Promise.resolve({ id: "unknown" }) }
    );

    await expect(response.json()).resolves.toEqual({ error: "Source not found." });
    expect(response.status).toBe(404);
  });

  it("rejects ingestion without admin token", async () => {
    const response = await ingestPost(jsonRequest("/api/ingest/rss", {}));

    await expect(response.json()).resolves.toEqual({ error: "Admin token required." });
    expect(response.status).toBe(401);
    expect(mocks.prisma.source.findMany).not.toHaveBeenCalled();
  });

  it("runs RSS ingestion for enabled sources with a valid admin token", async () => {
    mocks.prisma.source.findMany.mockResolvedValue([{ id: "source-1" }]);
    mocks.ingestSourcesWithTimeLimit.mockResolvedValue({
      processed: ["source-1"],
      remaining: [],
      results: [
        {
          sourceId: "source-1",
          sourceName: "WHO",
          ok: true,
          result: { sourceId: "source-1", createdArticles: 2, duplicateArticles: 0, candidateEvents: 1 }
        }
      ]
    });

    const response = await ingestPost(
      jsonRequest("/api/ingest/rss", {}, { token: "dev-admin-token" })
    );

    await expect(response.json()).resolves.toEqual({
      processed: ["source-1"],
      remaining: [],
      results: [
        {
          sourceId: "source-1",
          sourceName: "WHO",
          ok: true,
          result: { sourceId: "source-1", createdArticles: 2, duplicateArticles: 0, candidateEvents: 1 }
        }
      ]
    });
    expect(response.status).toBe(200);
    expect(mocks.prisma.source.findMany).toHaveBeenCalledWith({ where: { enabled: true }, select: { id: true } });
    expect(mocks.ingestSourcesWithTimeLimit).toHaveBeenCalledWith(["source-1"]);
  });

  it("approves a review event with a valid admin token", async () => {
    mocks.prisma.riskEvent.updateMany.mockResolvedValue({ count: 1 });

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

    await expect(response.json()).resolves.toEqual({ id: "event-1", status: EventStatus.PUBLISHED });
    expect(response.status).toBe(200);
    expect(mocks.prisma.riskEvent.updateMany).toHaveBeenCalledWith({
      where: { id: "event-1", status: EventStatus.NEEDS_REVIEW },
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

describe("GET /api/events", () => {
  it("returns published events with pagination metadata", async () => {
    const events = [{ id: "e1", title: "Flood", status: EventStatus.PUBLISHED }];
    mocks.prisma.riskEvent.findMany.mockResolvedValue(events);
    mocks.prisma.riskEvent.count.mockResolvedValue(1);

    const response = await eventsGet(getRequest("/api/events"));

    await expect(response.json()).resolves.toMatchObject({ events, total: 1, page: 1, totalPages: 1 });
    expect(response.status).toBe(200);
  });

  it("ignores non-PUBLISHED status param — always returns PUBLISHED", async () => {
    mocks.prisma.riskEvent.findMany.mockResolvedValue([]);
    mocks.prisma.riskEvent.count.mockResolvedValue(0);

    await eventsGet(getRequest("/api/events?status=DRAFT"));

    expect(mocks.prisma.riskEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: EventStatus.PUBLISHED }) })
    );
  });

  it("ignores invalid category param", async () => {
    mocks.prisma.riskEvent.findMany.mockResolvedValue([]);
    mocks.prisma.riskEvent.count.mockResolvedValue(0);

    await eventsGet(getRequest("/api/events?category=INVALID"));

    expect(mocks.prisma.riskEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: undefined }) })
    );
  });

  it("clamps limit to MAX_LIMIT (100)", async () => {
    mocks.prisma.riskEvent.findMany.mockResolvedValue([]);
    mocks.prisma.riskEvent.count.mockResolvedValue(0);

    await eventsGet(getRequest("/api/events?limit=999"));

    expect(mocks.prisma.riskEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it("filters by valid category param", async () => {
    mocks.prisma.riskEvent.findMany.mockResolvedValue([]);
    mocks.prisma.riskEvent.count.mockResolvedValue(0);

    await eventsGet(getRequest("/api/events?category=NATURAL_DISASTER"));

    expect(mocks.prisma.riskEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: EventCategory.NATURAL_DISASTER }) })
    );
  });
});

describe("GET /api/events/[id]", () => {
  it("returns a published event by id", async () => {
    const event = { id: "e1", title: "Flood", status: EventStatus.PUBLISHED, rawArticles: [] };
    mocks.prisma.riskEvent.findUnique.mockResolvedValue(event);

    const response = await eventGet(new Request("http://localhost/api/events/e1"), {
      params: Promise.resolve({ id: "e1" })
    });

    await expect(response.json()).resolves.toEqual({ event });
    expect(response.status).toBe(200);
    expect(mocks.prisma.riskEvent.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e1", status: EventStatus.PUBLISHED } })
    );
  });

  it("returns 404 when event not found or not published", async () => {
    mocks.prisma.riskEvent.findUnique.mockResolvedValue(null);

    const response = await eventGet(new Request("http://localhost/api/events/missing"), {
      params: Promise.resolve({ id: "missing" })
    });

    await expect(response.json()).resolves.toEqual({ error: "Event not found" });
    expect(response.status).toBe(404);
  });
});

describe("POST /api/admin/bulk-approve", () => {
  it("rejects without admin token", async () => {
    const response = await bulkApprovePost(jsonRequest("/api/admin/bulk-approve", {}));

    await expect(response.json()).resolves.toEqual({ error: "Admin token required." });
    expect(response.status).toBe(401);
  });

  it("returns approved: 0 when no AI-enriched events are in review queue", async () => {
    mocks.prisma.riskEvent.updateMany.mockResolvedValue({ count: 0 });

    const response = await bulkApprovePost(
      jsonRequest("/api/admin/bulk-approve", {}, { token: "dev-admin-token" })
    );

    await expect(response.json()).resolves.toEqual({ approved: 0 });
    expect(response.status).toBe(200);
  });

  it("publishes only AI-enriched review events and returns count", async () => {
    mocks.prisma.riskEvent.updateMany.mockResolvedValue({ count: 1 });

    const response = await bulkApprovePost(
      jsonRequest("/api/admin/bulk-approve", {}, { token: "dev-admin-token" })
    );

    await expect(response.json()).resolves.toEqual({ approved: 1 });
    expect(mocks.prisma.riskEvent.updateMany).toHaveBeenCalledWith({
      where: {
        status: EventStatus.NEEDS_REVIEW,
        aiEnhanced: true
      },
      data: { status: EventStatus.PUBLISHED }
    });
  });
});

describe("POST /api/admin/process-next", () => {
  it("rejects without admin token", async () => {
    const response = await processNextPost(jsonRequest("/api/admin/process-next", {}));

    await expect(response.json()).resolves.toEqual({ error: "Admin token required." });
    expect(response.status).toBe(401);
    expect(mocks.enrichPendingArticles).not.toHaveBeenCalled();
  });

  it("processes one pending article before unenriched events", async () => {
    mocks.prisma.rawArticle.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    mocks.enrichPendingArticles.mockResolvedValue({ processed: 1, notRisk: 0, skipped: 0, remaining: 1 });

    const response = await processNextPost(
      jsonRequest("/api/admin/process-next", {}, { token: "dev-admin-token" })
    );

    await expect(response.json()).resolves.toEqual({ done: false, kind: "article", remaining: 1 });
    expect(response.status).toBe(200);
    expect(mocks.enrichPendingArticles).toHaveBeenCalledWith(1);
    expect(mocks.prisma.riskEvent.findFirst).not.toHaveBeenCalled();
  });

  it("stops the client loop when AI is temporarily unavailable for articles", async () => {
    mocks.prisma.rawArticle.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    mocks.enrichPendingArticles.mockResolvedValue({ processed: 0, notRisk: 0, skipped: 1, remaining: 1 });

    const response = await processNextPost(
      jsonRequest("/api/admin/process-next", {}, { token: "dev-admin-token" })
    );

    await expect(response.json()).resolves.toEqual({ done: true, kind: "article", remaining: 1 });
  });

  it("processes one unenriched event when no articles are pending", async () => {
    mocks.prisma.rawArticle.count.mockResolvedValue(0);
    mocks.prisma.riskEvent.findFirst.mockResolvedValue({ id: "event-1" });
    mocks.enrichEvent.mockResolvedValue({ ok: true, notRisk: false });
    mocks.prisma.riskEvent.count.mockResolvedValue(0);

    const response = await processNextPost(
      jsonRequest("/api/admin/process-next", {}, { token: "dev-admin-token" })
    );

    await expect(response.json()).resolves.toEqual({ done: true, kind: "event", remaining: 0 });
    expect(mocks.enrichEvent).toHaveBeenCalledWith("event-1");
  });

  it("returns done when no enrichment work remains", async () => {
    mocks.prisma.rawArticle.count.mockResolvedValue(0);
    mocks.prisma.riskEvent.findFirst.mockResolvedValue(null);

    const response = await processNextPost(
      jsonRequest("/api/admin/process-next", {}, { token: "dev-admin-token" })
    );

    await expect(response.json()).resolves.toEqual({ done: true, kind: "none", remaining: 0 });
  });
});

describe("POST /api/admin/promote-article", () => {
  it("rejects without admin token", async () => {
    const response = await promoteArticlePost(jsonRequest("/api/admin/promote-article", { articleId: "article-1" }));

    await expect(response.json()).resolves.toEqual({ error: "Admin token required." });
    expect(response.status).toBe(401);
    expect(mocks.prisma.rawArticle.findUnique).not.toHaveBeenCalled();
  });

  it("validates request body before touching the database", async () => {
    const response = await promoteArticlePost(
      jsonRequest("/api/admin/promote-article", {}, { token: "dev-admin-token" })
    );

    await expect(response.json()).resolves.toEqual({ error: "articleId required" });
    expect(response.status).toBe(400);
    expect(mocks.prisma.rawArticle.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the raw article does not exist", async () => {
    mocks.prisma.rawArticle.findUnique.mockResolvedValue(null);

    const response = await promoteArticlePost(
      jsonRequest("/api/admin/promote-article", { articleId: "missing" }, { token: "dev-admin-token" })
    );

    await expect(response.json()).resolves.toEqual({ error: "Article not found" });
    expect(response.status).toBe(404);
  });

  it("returns 409 when the raw article is already linked", async () => {
    mocks.prisma.rawArticle.findUnique.mockResolvedValue({
      id: "article-1",
      riskEventId: "event-1",
      source: { id: "source-1", trustScore: 0.8, type: SourceType.RSS }
    });

    const response = await promoteArticlePost(
      jsonRequest("/api/admin/promote-article", { articleId: "article-1" }, { token: "dev-admin-token" })
    );

    await expect(response.json()).resolves.toEqual({ error: "Already linked to an event" });
    expect(response.status).toBe(409);
  });

  it("creates a review event and clears the AI-rejected flag", async () => {
    const article = {
      id: "article-1",
      title: "Flooding reported",
      rawText: "Flooding reported near the river.",
      url: "https://example.com/flood",
      publishedAt: new Date("2026-05-30T12:00:00Z"),
      riskEventId: null,
      source: { id: "source-1", trustScore: 0.8, type: SourceType.RSS }
    };
    const extracted = {
      title: "Flooding reported",
      summary: "Flooding reported near the river.",
      category: EventCategory.NATURAL_DISASTER,
      country: "France",
      city: "Paris",
      latitude: 48.8566,
      longitude: 2.3522,
      locationConfidence: 0.8,
      severity: Severity.MEDIUM,
      confidence: 0.6,
      signals: [{ label: "test" }]
    };
    const scored = {
      severity: Severity.HIGH,
      confidence: 0.74,
      signals: [{ label: "score" }]
    };

    mocks.prisma.rawArticle.findUnique.mockResolvedValue(article);
    mocks.extractEventFromArticle.mockReturnValue(extracted);
    mocks.scoreCandidate.mockReturnValue(scored);
    mocks.tx.riskEvent.create.mockResolvedValue({ id: "event-1" });

    const response = await promoteArticlePost(
      jsonRequest("/api/admin/promote-article", { articleId: "article-1" }, { token: "dev-admin-token" })
    );

    await expect(response.json()).resolves.toEqual({ eventId: "event-1" });
    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalled();
    expect(mocks.tx.riskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: extracted.title,
        category: extracted.category,
        status: EventStatus.NEEDS_REVIEW,
        extractionSource: "rules",
        aiEnhanced: false
      })
    });
    expect(mocks.tx.rawArticle.update).toHaveBeenCalledWith({
      where: { id: "article-1" },
      data: { riskEventId: "event-1", aiRejected: false }
    });
  });
});

function getRequest(path: string) {
  return new NextRequest(`http://localhost${path}`, { method: "GET" });
}

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
