import { describe, expect, it } from "vitest";
import { EventCategory, EventStatus } from "@prisma/client";
import { rankMergeSuggestions, scoreMergeTarget } from "@/lib/review/merge-suggestions";

const now = new Date();

function event(overrides: Partial<Parameters<typeof scoreMergeTarget>[0]> = {}) {
  return {
    id: "event",
    title: "Green flood alert in Malaysia",
    summary: "A flood started in Malaysia and emergency monitoring is ongoing.",
    category: EventCategory.NATURAL_DISASTER,
    status: EventStatus.NEEDS_REVIEW,
    country: "Malaysia",
    city: null,
    updatedAt: now,
    ...overrides
  };
}

describe("scoreMergeTarget", () => {
  it("excludes self merge", () => {
    const source = event({ id: "same" });
    const target = event({ id: "same" });

    expect(scoreMergeTarget(source, target)).toBeNull();
  });

  it("excludes rejected targets", () => {
    const source = event({ id: "source" });
    const target = event({ id: "target", status: EventStatus.REJECTED });

    expect(scoreMergeTarget(source, target)).toBeNull();
  });

  it("scores same-category same-country similar targets highly", () => {
    const source = event({ id: "source" });
    const target = event({
      id: "target",
      status: EventStatus.PUBLISHED,
      title: "Flood alert continues in Malaysia",
      summary: "Emergency monitoring continues after flooding in Malaysia."
    });

    const result = scoreMergeTarget(source, target);

    expect(result?.score).toBeGreaterThanOrEqual(0.7);
    expect(result?.reasons).toContain("same category");
    expect(result?.reasons).toContain("same country");
  });
});

describe("rankMergeSuggestions", () => {
  it("ranks likely duplicates above broad manual candidates", () => {
    const source = event({ id: "source" });
    const strong = event({
      id: "strong",
      title: "Flood alert continues in Malaysia",
      status: EventStatus.PUBLISHED
    });
    const weak = event({
      id: "weak",
      title: "Cyber incident reported in France",
      summary: "A cyber incident was reported.",
      category: EventCategory.CYBER_ATTACK,
      country: "France",
      status: EventStatus.PUBLISHED
    });

    const ranked = rankMergeSuggestions(source, [weak, strong]);

    expect(ranked[0].id).toBe("strong");
    expect(ranked[1].id).toBe("weak");
  });
});

