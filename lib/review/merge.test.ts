import { describe, expect, it } from "vitest";
import { EventStatus } from "@prisma/client";
import { mergeConfidence, mergeRiskEvent } from "@/lib/review/merge";

describe("mergeConfidence", () => {
  it("raises confidence conservatively for moved evidence", () => {
    expect(mergeConfidence(0.7, 2)).toBe(0.8);
  });

  it("caps confidence at 1", () => {
    expect(mergeConfidence(0.98, 2)).toBe(1);
  });
});

describe("mergeRiskEvent", () => {
  it("rejects self-merge", async () => {
    await expect(
      mergeRiskEvent({
        prisma: { $transaction: async () => undefined } as never,
        sourceEventId: "same",
        targetEventId: "same"
      })
    ).rejects.toThrow("Cannot merge an event into itself.");
  });

  it("moves evidence to target and rejects source event", async () => {
    const calls: string[] = [];
    const tx = {
      riskEvent: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          if (where.id === "source") {
            return {
              id: "source",
              confidence: 0.4,
              rawArticles: [{ id: "raw-1" }, { id: "raw-2" }]
            };
          }

          return {
            id: "target",
            confidence: 0.7,
            rawArticles: [{ id: "raw-3" }]
          };
        },
        update: async ({ where, data }: { where: { id: string }; data: { status?: EventStatus; confidence?: number } }) => {
          calls.push(`${where.id}:${data.status ?? data.confidence}`);
          return { id: where.id, ...data };
        }
      },
      rawArticle: {
        updateMany: async ({ data }: { data: { riskEventId: string } }) => {
          calls.push(`raw:${data.riskEventId}`);
          return { count: 2 };
        }
      }
    };

    const prisma = {
      $transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx)
    };

    const result = await mergeRiskEvent({
      prisma: prisma as never,
      sourceEventId: "source",
      targetEventId: "target"
    });

    expect(result.movedEvidenceCount).toBe(2);
    expect(calls).toEqual(["raw:target", "target:0.8", "source:REJECTED"]);
  });
});

