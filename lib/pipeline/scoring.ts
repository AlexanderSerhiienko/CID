import { EventCategory, EventStatus, Severity, Source } from "@prisma/client";
import { PipelineSignal } from "@/lib/pipeline/extraction";
import { clamp } from "@/lib/utils";

const TRUST_SCORE_WEIGHT = 0.25;
const CONFIRMED_CONFIDENCE_BOOST = 0.15;
const UNCERTAIN_CONFIDENCE_PENALTY = 0.1;

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

  const status = EventStatus.NEEDS_REVIEW;

  return {
    confidence: Number(confidence.toFixed(2)),
    severity,
    status,
    signals
  };
}
