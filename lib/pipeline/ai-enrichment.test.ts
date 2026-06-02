import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    rawArticle: {
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    riskEvent: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  extractWithAIThrottled: vi.fn(),
  geocodeLocation: vi.fn(),
  extractEventFromArticle: vi.fn(),
  scoreCandidate: vi.fn(),
  isDuplicateCandidate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/pipeline/ai-extraction", () => ({ extractWithAIThrottled: mocks.extractWithAIThrottled }));
vi.mock("@/lib/pipeline/geocoder", () => ({ geocodeLocation: mocks.geocodeLocation }));
vi.mock("@/lib/pipeline/extraction", () => ({
  extractEventFromArticle: mocks.extractEventFromArticle,
  CONFIDENCE_CATEGORY_BONUS: 0.1,
}));
vi.mock("@/lib/pipeline/scoring", () => ({ scoreCandidate: mocks.scoreCandidate }));
vi.mock("@/lib/pipeline/deduplication", () => ({ isDuplicateCandidate: mocks.isDuplicateCandidate }));

import { enrichPendingArticles } from "./ai-enrichment";

describe("enrichPendingArticles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.rawArticle.findMany.mockResolvedValue([]);
    mocks.prisma.riskEvent.findMany.mockResolvedValue([]);
    mocks.prisma.rawArticle.count.mockResolvedValue(0);
  });

  it("queries all pending articles without a createdAt filter", async () => {
    await enrichPendingArticles();

    const calls = mocks.prisma.rawArticle.findMany.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const where = calls[0][0].where;
    expect(where).toEqual({ aiPending: true });
    expect(where).not.toHaveProperty("createdAt");
  });
});
