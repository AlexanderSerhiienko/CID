import { EventCategory, EventStatus, Severity, SourceType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { scoreCandidate } from "./scoring";

const rssSource = { trustScore: 0.6, type: SourceType.RSS };
const officialSource = { trustScore: 0.9, type: SourceType.OFFICIAL_FEED };

describe("scoreCandidate", () => {
  it("adds trust score weight to base confidence", () => {
    const result = scoreCandidate({
      category: EventCategory.NATURAL_DISASTER,
      severity: Severity.HIGH,
      confidence: 0.5,
      locationConfidence: 0.8,
      source: { trustScore: 0.8 },
      rawText: "Earthquake reported."
    });
    // 0.5 + 0.8 * 0.25 = 0.7
    expect(result.confidence).toBe(0.7);
  });

  it("boosts confidence for 'confirmed' text", () => {
    const result = scoreCandidate({
      category: EventCategory.NATURAL_DISASTER,
      severity: Severity.HIGH,
      confidence: 0.5,
      locationConfidence: 0.8,
      source: rssSource,
      rawText: "Confirmed outbreak in the region."
    });
    // 0.5 + 0.6*0.25 + 0.15 = 0.8
    expect(result.confidence).toBe(0.8);
    expect(result.signals.some((s) => s.label === "confidence:confirmed")).toBe(true);
  });

  it("penalizes confidence for 'suspected' text", () => {
    const result = scoreCandidate({
      category: EventCategory.DISEASE_OUTBREAK,
      severity: Severity.MEDIUM,
      confidence: 0.5,
      locationConfidence: 0.5,
      source: rssSource,
      rawText: "Suspected outbreak in the region."
    });
    // 0.5 + 0.6*0.25 - 0.1 = 0.55
    expect(result.confidence).toBe(0.55);
    expect(result.signals.some((s) => s.label === "confidence:uncertain_language")).toBe(true);
  });

  it("clamps confidence to [0, 1]", () => {
    const result = scoreCandidate({
      category: EventCategory.NATURAL_DISASTER,
      severity: Severity.HIGH,
      confidence: 0.95,
      locationConfidence: 0.9,
      source: { trustScore: 1.0 },
      rawText: "Confirmed catastrophic event."
    });
    expect(result.confidence).toBe(1);
  });

  it("escalates severity to HIGH on impact terms", () => {
    const result = scoreCandidate({
      category: EventCategory.NATURAL_DISASTER,
      severity: Severity.LOW,
      confidence: 0.5,
      locationConfidence: 0.5,
      source: rssSource,
      rawText: "Multiple deaths reported after the flood."
    });
    expect(result.severity).toBe(Severity.HIGH);
    expect(result.signals.some((s) => s.label === "severity:impact_terms")).toBe(true);
  });

  it("escalates severity to CRITICAL on critical terms", () => {
    const result = scoreCandidate({
      category: EventCategory.NATURAL_DISASTER,
      severity: Severity.MEDIUM,
      confidence: 0.5,
      locationConfidence: 0.5,
      source: rssSource,
      rawText: "State of emergency declared."
    });
    expect(result.severity).toBe(Severity.CRITICAL);
    expect(result.signals.some((s) => s.label === "severity:critical_terms")).toBe(true);
  });

  it("does not downgrade severity via escalation terms", () => {
    const result = scoreCandidate({
      category: EventCategory.NATURAL_DISASTER,
      severity: Severity.CRITICAL,
      confidence: 0.5,
      locationConfidence: 0.5,
      source: rssSource,
      rawText: "Evacuation ordered."
    });
    expect(result.severity).toBe(Severity.CRITICAL);
  });

  describe("status assignment (standard source)", () => {
    it("sends high-confidence high-severity located events to NEEDS_REVIEW", () => {
      const result = scoreCandidate({
        category: EventCategory.NATURAL_DISASTER,
        severity: Severity.HIGH,
        confidence: 0.6,
        locationConfidence: 0.7,
        source: { trustScore: 0.8, type: SourceType.RSS }, // 0.6 + 0.8*0.25 = 0.8
        rawText: "Flood reported."
      });
      expect(result.status).toBe(EventStatus.NEEDS_REVIEW);
    });

    it("sends to NEEDS_REVIEW when confidence below threshold", () => {
      const result = scoreCandidate({
        category: EventCategory.NATURAL_DISASTER,
        severity: Severity.HIGH,
        confidence: 0.4,
        locationConfidence: 0.7,
        source: rssSource,
        rawText: "Flood reported."
      });
      expect(result.status).toBe(EventStatus.NEEDS_REVIEW);
    });

    it("sends to NEEDS_REVIEW when severity is MEDIUM (not HIGH/CRITICAL)", () => {
      const result = scoreCandidate({
        category: EventCategory.NATURAL_DISASTER,
        severity: Severity.MEDIUM,
        confidence: 0.6,
        locationConfidence: 0.7,
        source: { trustScore: 0.8, type: SourceType.RSS },
        rawText: "Minor flooding."
      });
      expect(result.status).toBe(EventStatus.NEEDS_REVIEW);
    });

    it("sends to NEEDS_REVIEW when category is UNKNOWN", () => {
      const result = scoreCandidate({
        category: EventCategory.UNKNOWN,
        severity: Severity.HIGH,
        confidence: 0.6,
        locationConfidence: 0.7,
        source: { trustScore: 0.8, type: SourceType.RSS },
        rawText: "Something happened."
      });
      expect(result.status).toBe(EventStatus.NEEDS_REVIEW);
    });
  });

  describe("official feed scoring", () => {
    it("sends official feed events to NEEDS_REVIEW", () => {
      const result = scoreCandidate({
        category: EventCategory.DISEASE_OUTBREAK,
        severity: Severity.MEDIUM,
        confidence: 0.5,
        locationConfidence: 0.0,
        source: officialSource, // 0.5 + 0.9*0.25 = 0.725 >= 0.6
        rawText: "WHO advisory issued."
      });
      expect(result.status).toBe(EventStatus.NEEDS_REVIEW);
    });

    it("sends official feed to NEEDS_REVIEW when confidence below 0.6", () => {
      const result = scoreCandidate({
        category: EventCategory.DISEASE_OUTBREAK,
        severity: Severity.MEDIUM,
        confidence: 0.0,
        locationConfidence: 0.0,
        source: { trustScore: 0.1, type: SourceType.OFFICIAL_FEED }, // 0 + 0.1*0.25 = 0.025
        rawText: "Advisory issued."
      });
      expect(result.status).toBe(EventStatus.NEEDS_REVIEW);
    });

    it("sends official feed to NEEDS_REVIEW when category UNKNOWN", () => {
      const result = scoreCandidate({
        category: EventCategory.UNKNOWN,
        severity: Severity.HIGH,
        confidence: 0.5,
        locationConfidence: 0.0,
        source: officialSource,
        rawText: "Unclassified event."
      });
      expect(result.status).toBe(EventStatus.NEEDS_REVIEW);
    });
  });

  it("always includes source:trust_score signal", () => {
    const result = scoreCandidate({
      category: EventCategory.CYBER_ATTACK,
      severity: Severity.LOW,
      confidence: 0.3,
      locationConfidence: 0.0,
      source: rssSource,
      rawText: "System breach reported."
    });
    expect(result.signals[0].label).toBe("source:trust_score");
  });
});
