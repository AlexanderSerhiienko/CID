/**
 * Integration tests for ingestRssSource.
 *
 * These tests verify that the pipeline stages (dedup, extraction, scoring,
 * event creation) work together correctly by mocking only the I/O boundaries:
 * the RSS parser, the database (prisma), the geocoder, and AI extraction.
 */
import { EventCategory, EventStatus, Severity, SourceType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseURL: vi.fn(),
  geocodeLocation: vi.fn().mockResolvedValue(null),
  extractWithAI: vi.fn().mockResolvedValue(null),
  prisma: {
    source: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn()
    },
    rawArticle: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "article-1" }),
      update: vi.fn().mockResolvedValue({})
    },
    riskEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "event-1" }),
      update: vi.fn().mockResolvedValue({})
    }
  }
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/pipeline/geocoder", () => ({ geocodeLocation: mocks.geocodeLocation }));
vi.mock("@/lib/pipeline/ai-extraction", () => ({
  extractWithAI: mocks.extractWithAI,
  GROQ_MODEL: "test-model"
}));
vi.mock("rss-parser", () => ({
  default: class MockParser {
    parseURL = mocks.parseURL;
  }
}));

import { ingestRssSource } from "./rss";

function makeSource(overrides?: Partial<{ enabled: boolean }>) {
  return {
    id: "source-1",
    name: "Test Feed",
    url: "https://example.com/feed.xml",
    type: SourceType.RSS,
    enabled: true,
    trustScore: 0.8,
    lastIngestedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function makeFeedItem(overrides?: Partial<{
  title: string;
  link: string;
  isoDate: string;
  content: string;
}>) {
  return {
    title: "Earthquake strikes northern Japan",
    link: "https://example.com/article/1",
    isoDate: "2026-05-28T10:00:00Z",
    content: "A strong earthquake struck northern Japan causing damage.",
    contentSnippet: undefined as string | undefined,
    summary: undefined as string | undefined,
    pubDate: undefined as string | undefined,
    ...overrides
  };
}

describe("ingestRssSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.rawArticle.findFirst.mockResolvedValue(null);
    mocks.prisma.rawArticle.create.mockResolvedValue({ id: "article-1" });
    mocks.prisma.rawArticle.update.mockResolvedValue({});
    mocks.prisma.riskEvent.findMany.mockResolvedValue([]);
    mocks.prisma.riskEvent.create.mockResolvedValue({ id: "event-1" });
    mocks.prisma.riskEvent.update.mockResolvedValue({});
    mocks.prisma.source.update.mockResolvedValue({});
  });

  it("returns early when source is disabled", async () => {
    mocks.prisma.source.findUniqueOrThrow.mockResolvedValue(makeSource({ enabled: false }));

    const result = await ingestRssSource("source-1");

    expect(result).toEqual({ sourceId: "source-1", createdArticles: 0, duplicateArticles: 0, candidateEvents: 0 });
    expect(mocks.parseURL).not.toHaveBeenCalled();
  });

  it("skips items without a URL or title", async () => {
    mocks.prisma.source.findUniqueOrThrow.mockResolvedValue(makeSource());
    mocks.parseURL.mockResolvedValue({
      items: [
        { title: "No URL article", link: undefined },
        { title: undefined, link: "https://example.com/notitle" }
      ]
    });

    const result = await ingestRssSource("source-1");

    expect(result.createdArticles).toBe(0);
    expect(mocks.prisma.rawArticle.findFirst).not.toHaveBeenCalled();
  });

  it("counts duplicate articles already in the DB", async () => {
    mocks.prisma.source.findUniqueOrThrow.mockResolvedValue(makeSource());
    mocks.parseURL.mockResolvedValue({ items: [makeFeedItem()] });
    mocks.prisma.rawArticle.findFirst.mockResolvedValue({ id: "existing-article-1" });

    const result = await ingestRssSource("source-1");

    expect(result.duplicateArticles).toBe(1);
    expect(result.createdArticles).toBe(0);
    expect(mocks.prisma.rawArticle.create).not.toHaveBeenCalled();
  });

  it("creates a rawArticle without an event for non-risk content", async () => {
    mocks.prisma.source.findUniqueOrThrow.mockResolvedValue(makeSource());
    mocks.parseURL.mockResolvedValue({
      items: [makeFeedItem({ title: "Weekly newsletter digest", content: "This week in news..." })]
    });

    const result = await ingestRssSource("source-1");

    expect(mocks.prisma.rawArticle.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.riskEvent.create).not.toHaveBeenCalled();
    expect(result.createdArticles).toBe(1);
    expect(result.candidateEvents).toBe(0);
  });

  it("creates both rawArticle and riskEvent for a risk event article", async () => {
    mocks.prisma.source.findUniqueOrThrow.mockResolvedValue(makeSource());
    mocks.parseURL.mockResolvedValue({
      items: [
        makeFeedItem({
          title: "Earthquake strikes northern Japan",
          content: "A major earthquake struck northern Japan causing widespread damage and triggering tsunami warnings."
        })
      ]
    });

    const result = await ingestRssSource("source-1");

    expect(result.candidateEvents).toBe(1);
    expect(result.createdArticles).toBe(1);
    expect(mocks.prisma.rawArticle.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.riskEvent.create).toHaveBeenCalledTimes(1);

    // Verify event was created with expected category, country, and valid status
    const eventData = mocks.prisma.riskEvent.create.mock.calls[0][0].data;
    expect(eventData.category).toBe(EventCategory.NATURAL_DISASTER);
    expect(eventData.country).toBe("Japan");
    expect(Object.values(Severity)).toContain(eventData.severity);
    expect([EventStatus.PUBLISHED, EventStatus.NEEDS_REVIEW]).toContain(eventData.status);
  });

  it("links a duplicate article to an existing event instead of creating a new one", async () => {
    mocks.prisma.source.findUniqueOrThrow.mockResolvedValue(makeSource());
    mocks.parseURL.mockResolvedValue({
      items: [
        makeFeedItem({
          title: "Second report on Japan earthquake damage assessments continue",
          content: "Rescue teams continue searching in Japan earthquake zone. Damage assessment ongoing.",
          isoDate: "2026-05-29T10:00:00Z"
        })
      ]
    });

    // An existing event that the new article should be merged with
    const existingEvent = {
      id: "existing-event-1",
      title: "Major earthquake strikes northern Japan causing widespread damage",
      summary: "A strong earthquake struck northern Japan causing damage and triggering warnings.",
      category: EventCategory.NATURAL_DISASTER,
      country: "Japan",
      city: null,
      confidence: 0.8,
      createdAt: new Date("2026-05-28T10:00:00Z")
    };
    mocks.prisma.riskEvent.findMany.mockResolvedValue([existingEvent]);

    const result = await ingestRssSource("source-1");

    // Article created, but NO new event — linked to existing
    expect(result.createdArticles).toBe(1);
    expect(result.candidateEvents).toBe(0);
    expect(mocks.prisma.rawArticle.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.riskEvent.create).not.toHaveBeenCalled();
    expect(mocks.prisma.rawArticle.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { riskEventId: "existing-event-1" } })
    );
  });

  it("updates source lastIngestedAt and clears lastError on success", async () => {
    mocks.prisma.source.findUniqueOrThrow.mockResolvedValue(makeSource());
    mocks.parseURL.mockResolvedValue({ items: [] });

    await ingestRssSource("source-1");

    expect(mocks.prisma.source.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "source-1" },
        data: expect.objectContaining({ lastIngestedAt: expect.any(Date), lastError: null })
      })
    );
  });

  it("records the fetch error on source and rethrows", async () => {
    mocks.prisma.source.findUniqueOrThrow.mockResolvedValue(makeSource());
    mocks.parseURL.mockRejectedValue(new Error("Network timeout"));

    await expect(ingestRssSource("source-1")).rejects.toThrow("Network timeout");

    expect(mocks.prisma.source.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: "Network timeout" })
      })
    );
  });
});
