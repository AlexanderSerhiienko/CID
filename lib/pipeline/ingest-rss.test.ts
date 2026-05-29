/**
 * Integration tests for ingestRssSource.
 *
 * These tests verify that the pipeline stages (dedup, extraction, scoring,
 * event creation) work together correctly by mocking only the I/O boundaries:
 * the RSS parser, the database (prisma), the geocoder, and AI extraction.
 *
 * Implementation notes:
 * - Article dedup: ingestRssSource uses a batch prisma.rawArticle.findMany
 *   before the loop, not findFirst per item. Mocks must reflect this.
 * - Event creates: wrapped in prisma.$transaction — the callback receives
 *   a `tx` object; mocks.$transaction executes the callback with txFns.
 * - SIMILARITY_THRESHOLD is 0.3. Test titles for the duplicate-detection case
 *   are chosen so max(titleJaccard, summaryJaccard) > 0.3.
 */
import { EventCategory, EventStatus, SourceType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const txFns = {
  rawArticle: {
    create: vi.fn(),
    update: vi.fn()
  },
  riskEvent: {
    create: vi.fn(),
    update: vi.fn()
  }
};

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
      // Batch dedup query (one call before the loop, not one per item)
      findMany: vi.fn().mockResolvedValue([]),
      // Used for non-risk articles (single write, no transaction needed)
      create: vi.fn().mockResolvedValue({ id: "article-1" })
    },
    riskEvent: {
      // Pre-load recent events for in-memory dedup
      findMany: vi.fn().mockResolvedValue([])
    },
    // Risk-event and duplicate paths run inside $transaction
    $transaction: vi.fn(async (cb: (tx: typeof txFns) => Promise<unknown>) => cb(txFns))
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
    // Reset default mock return values after clearAllMocks wipes them
    mocks.prisma.rawArticle.findMany.mockResolvedValue([]);
    mocks.prisma.rawArticle.create.mockResolvedValue({ id: "article-1" });
    mocks.prisma.riskEvent.findMany.mockResolvedValue([]);
    mocks.prisma.source.update.mockResolvedValue({});
    mocks.prisma.$transaction.mockImplementation(
      async (cb: (tx: typeof txFns) => Promise<unknown>) => cb(txFns)
    );
    txFns.rawArticle.create.mockResolvedValue({ id: "article-1" });
    txFns.rawArticle.update.mockResolvedValue({});
    txFns.riskEvent.create.mockResolvedValue({
      id: "event-1",
      title: "",
      summary: "",
      category: EventCategory.NATURAL_DISASTER,
      country: "Japan",
      city: null,
      confidence: 0.5,
      createdAt: new Date()
    });
    txFns.riskEvent.update.mockResolvedValue({});
  });

  it("returns early when source is disabled", async () => {
    mocks.prisma.source.findUniqueOrThrow.mockResolvedValue(makeSource({ enabled: false }));

    const result = await ingestRssSource("source-1");

    expect(result).toEqual({ sourceId: "source-1", createdArticles: 0, duplicateArticles: 0, candidateEvents: 0 });
    expect(mocks.parseURL).not.toHaveBeenCalled();
  });

  it("skips items without a URL or title and still updates lastIngestedAt", async () => {
    mocks.prisma.source.findUniqueOrThrow.mockResolvedValue(makeSource());
    mocks.parseURL.mockResolvedValue({
      items: [
        { title: "No URL article", link: undefined },
        { title: undefined, link: "https://example.com/notitle" }
      ]
    });

    const result = await ingestRssSource("source-1");

    expect(result.createdArticles).toBe(0);
    // Empty preprocessed list triggers early return, but source.update still runs
    expect(mocks.prisma.source.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastIngestedAt: expect.any(Date) }) })
    );
    expect(mocks.prisma.rawArticle.create).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("counts duplicate articles using the batch dedup query", async () => {
    mocks.prisma.source.findUniqueOrThrow.mockResolvedValue(makeSource());
    mocks.parseURL.mockResolvedValue({ items: [makeFeedItem()] });
    // The batch findMany (first call) returns the article's URL as already seen
    mocks.prisma.rawArticle.findMany.mockResolvedValueOnce([
      { url: "https://example.com/article/1", contentHash: "existing-hash" }
    ]);

    const result = await ingestRssSource("source-1");

    expect(result.duplicateArticles).toBe(1);
    expect(result.createdArticles).toBe(0);
    // URL matched in the Set — no DB write at all
    expect(mocks.prisma.rawArticle.create).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates rawArticle directly (no transaction) for non-risk content", async () => {
    mocks.prisma.source.findUniqueOrThrow.mockResolvedValue(makeSource());
    mocks.parseURL.mockResolvedValue({
      items: [makeFeedItem({ title: "Weekly newsletter digest", content: "This week in news..." })]
    });

    const result = await ingestRssSource("source-1");

    // Non-risk article: single prisma.rawArticle.create outside any transaction
    expect(mocks.prisma.rawArticle.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(result.createdArticles).toBe(1);
    expect(result.candidateEvents).toBe(0);
  });

  it("creates rawArticle + riskEvent inside a transaction for a risk event", async () => {
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
    // Both writes happen inside a single $transaction — atomic, no orphan risk
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txFns.rawArticle.create).toHaveBeenCalledTimes(1);
    expect(txFns.riskEvent.create).toHaveBeenCalledTimes(1);

    // Verify the event has the right category and country extracted from the article
    const eventData = txFns.riskEvent.create.mock.calls[0][0].data;
    expect(eventData.category).toBe(EventCategory.NATURAL_DISASTER);
    expect(eventData.country).toBe("Japan");
    expect([EventStatus.PUBLISHED, EventStatus.NEEDS_REVIEW]).toContain(eventData.status);
  });

  it("links a duplicate article to an existing event (no new riskEvent created)", async () => {
    mocks.prisma.source.findUniqueOrThrow.mockResolvedValue(makeSource());

    // Title pair: titleJaccard ≈ 0.33, above SIMILARITY_THRESHOLD of 0.3.
    // Shared tokens: "japan", "earthquake", "dozens" (3 of 9 union tokens).
    mocks.parseURL.mockResolvedValue({
      items: [
        makeFeedItem({
          title: "Japan earthquake kills dozens as buildings collapse",
          content: "A strong earthquake in Japan has killed dozens of people. Buildings collapsed across northern Japan.",
          isoDate: "2026-05-29T10:00:00Z"
        })
      ]
    });

    const existingEvent = {
      id: "existing-event-1",
      title: "Strong earthquake strikes Japan, dozens dead",
      summary: "A strong earthquake struck Japan killing dozens and causing widespread building damage.",
      category: EventCategory.NATURAL_DISASTER,
      country: "Japan",
      city: null,
      confidence: 0.8,
      createdAt: new Date("2026-05-28T10:00:00Z")
    };
    // riskEvent.findMany is called twice: once for recentEvents pre-load, skip batch dedup
    mocks.prisma.riskEvent.findMany.mockResolvedValue([existingEvent]);

    const result = await ingestRssSource("source-1");

    // Article created and linked, but no new riskEvent
    expect(result.createdArticles).toBe(1);
    expect(result.candidateEvents).toBe(0);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txFns.rawArticle.create).toHaveBeenCalledTimes(1);
    expect(txFns.riskEvent.create).not.toHaveBeenCalled();
    expect(txFns.rawArticle.update).toHaveBeenCalledWith(
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
