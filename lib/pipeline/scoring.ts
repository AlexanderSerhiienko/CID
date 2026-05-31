import { EventCategory, EventStatus, Severity, Source, SourceType } from "@prisma/client";
import { PipelineSignal } from "@/lib/pipeline/extraction";
import { clamp } from "@/lib/utils";

const TRUST_SCORE_WEIGHT = 0.25;
const CONFIRMED_CONFIDENCE_BOOST = 0.15;
const UNCERTAIN_CONFIDENCE_PENALTY = 0.1;

// Standard auto-publish threshold (non-official sources)
const AUTO_PUBLISH_CONFIDENCE_THRESHOLD = 0.8;
const AUTO_PUBLISH_LOCATION_CONFIDENCE_THRESHOLD = 0.6;

// Relaxed thresholds for OFFICIAL_FEED sources (WHO, USGS, CDC, GDACS, etc.)
// These sources have high trust scores and are generally reliable without human review.
const OFFICIAL_FEED_CONFIDENCE_THRESHOLD = 0.6;

const HIGH_SEVERITY_ESCALATION_TERMS = ["death", "deaths", "hospitalized", "evacuation", "critical infrastructure"];
const CRITICAL_SEVERITY_ESCALATION_TERMS = ["mass casualty", "catastrophic", "state of emergency"];

// Ordinal map for severity comparison — escalation must only move upward.
const SEVERITY_RANK: Record<Severity, number> = {
  [Severity.LOW]: 0,
  [Severity.MEDIUM]: 1,
  [Severity.HIGH]: 2,
  [Severity.CRITICAL]: 3
};

export function scoreCandidate(input: {
  category: EventCategory;
  severity: Severity;
  confidence: number;
  locationConfidence: number;
  source: Pick<Source, "trustScore"> & { type?: Source["type"] };
  rawText: string;
}) {
  const lower = input.rawText.toLowerCase();
  let confidence = input.confidence + input.source.trustScore * TRUST_SCORE_WEIGHT;
  const signals: PipelineSignal[] = [
    {
      kind: "source",
      label: "source:trust_score",
      detail: `Source trust score contributed ${Math.round(input.source.trustScore * 25)} confidence points.`,
      weight: input.source.trustScore
    }
  ];

  if (lower.includes("confirmed")) {
    confidence += CONFIRMED_CONFIDENCE_BOOST;
    signals.push({
      kind: "confidence",
      label: "confidence:confirmed",
      detail: "Text mentions confirmed information.",
      weight: CONFIRMED_CONFIDENCE_BOOST
    });
  }

  if (lower.includes("suspected") || lower.includes("possible")) {
    confidence -= UNCERTAIN_CONFIDENCE_PENALTY;
    signals.push({
      kind: "confidence",
      label: "confidence:uncertain_language",
      detail: "Text mentions suspected or possible information.",
      weight: -UNCERTAIN_CONFIDENCE_PENALTY
    });
  }

  confidence = clamp(confidence, 0, 1);

  let severity = input.severity;
  if (HIGH_SEVERITY_ESCALATION_TERMS.some((word) => lower.includes(word))) {
    if (SEVERITY_RANK[severity] < SEVERITY_RANK[Severity.HIGH]) {
      severity = Severity.HIGH;
    }
    signals.push({
      kind: "severity",
      label: "severity:impact_terms",
      detail: "Text mentions deaths, hospitalization, evacuation, or critical infrastructure."
    });
  }

  if (CRITICAL_SEVERITY_ESCALATION_TERMS.some((word) => lower.includes(word))) {
    if (SEVERITY_RANK[severity] < SEVERITY_RANK[Severity.CRITICAL]) {
      severity = Severity.CRITICAL;
    }
    signals.push({
      kind: "severity",
      label: "severity:critical_terms",
      detail: "Text contains critical impact language."
    });
  }

  const isOfficialFeed = input.source.type === SourceType.OFFICIAL_FEED;

  const shouldAutoPublish = canAutoPublish({
    confidence,
    locationConfidence: input.locationConfidence,
    severity,
    category: input.category,
    isOfficialFeed
  });

  if (shouldAutoPublish) {
    const reason = isOfficialFeed
      ? "Official-feed event at MEDIUM+ severity auto-published without manual review."
      : "High-confidence, high-severity located event can be published without manual review.";
    signals.push({
      kind: "confidence",
      label: "status:auto_published",
      detail: reason
    });
  }

  const status = shouldAutoPublish ? EventStatus.PUBLISHED : EventStatus.NEEDS_REVIEW;

  return {
    confidence: Number(confidence.toFixed(2)),
    severity,
    status,
    signals
  };
}

export function canAutoPublish(input: {
  confidence: number;
  locationConfidence: number;
  severity: Severity;
  category: EventCategory;
  isOfficialFeed: boolean;
}): boolean {
  const canAutoPublishAsOfficial =
    input.isOfficialFeed &&
    input.confidence >= OFFICIAL_FEED_CONFIDENCE_THRESHOLD &&
    input.category !== EventCategory.UNKNOWN &&
    (input.severity === Severity.MEDIUM ||
      input.severity === Severity.HIGH ||
      input.severity === Severity.CRITICAL);

  const canAutoPublishStandard =
    !input.isOfficialFeed &&
    input.confidence >= AUTO_PUBLISH_CONFIDENCE_THRESHOLD &&
    input.locationConfidence >= AUTO_PUBLISH_LOCATION_CONFIDENCE_THRESHOLD &&
    input.category !== EventCategory.UNKNOWN &&
    (input.severity === Severity.HIGH || input.severity === Severity.CRITICAL);

  return canAutoPublishAsOfficial || canAutoPublishStandard;
}
