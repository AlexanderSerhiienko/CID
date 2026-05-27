import { describe, expect, it } from "vitest";
import { EventCategory, EventStatus, Severity } from "@prisma/client";
import { extractEventFromArticle } from "@/lib/pipeline/extraction";
import { scoreCandidate } from "@/lib/pipeline/scoring";

describe("pipeline behavior", () => {
  it("does not promote obvious non-risk news into a risk event", () => {
    const extracted = extractEventFromArticle({
      title: "WHO Member States agree to extend negotiations on key annex",
      rawText: "Member States agreed to extend negotiations on a policy annex."
    });

    expect(extracted.isLikelyRiskEvent).toBe(false);
  });

  it("routes vague risk events to review", () => {
    const extracted = extractEventFromArticle({
      title: "Green flood alert in Malaysia",
      rawText: "A flood started in Malaysia and emergency monitoring is ongoing."
    });
    const scored = scoreCandidate({
      category: extracted.category,
      severity: extracted.severity,
      confidence: extracted.confidence,
      locationConfidence: 0,
      source: { trustScore: 0.9 },
      rawText: "A flood started in Malaysia and emergency monitoring is ongoing."
    });

    expect(extracted.isLikelyRiskEvent).toBe(true);
    expect(extracted.category).toBe(EventCategory.NATURAL_DISASTER);
    expect(scored.status).toBe(EventStatus.NEEDS_REVIEW);
  });

  it("auto-publishes high-confidence high-severity located risk events", () => {
    const scored = scoreCandidate({
      category: EventCategory.DISEASE_OUTBREAK,
      severity: Severity.MEDIUM,
      confidence: 0.7,
      locationConfidence: 0.85,
      source: { trustScore: 0.95 },
      rawText: "Officials confirmed cases and hospitalized patients."
    });

    expect(scored.status).toBe(EventStatus.PUBLISHED);
    expect(scored.signals).toContainEqual(
      expect.objectContaining({
        label: "status:auto_published"
      })
    );
  });

  it("keeps low-severity high-confidence events in review", () => {
    const scored = scoreCandidate({
      category: EventCategory.NATURAL_DISASTER,
      severity: Severity.LOW,
      confidence: 0.75,
      locationConfidence: 0.85,
      source: { trustScore: 0.95 },
      rawText: "M 4.5 earthquake report with no damage mentioned."
    });

    expect(scored.status).toBe(EventStatus.NEEDS_REVIEW);
  });
});
