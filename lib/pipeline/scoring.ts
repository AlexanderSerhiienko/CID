import { EventCategory, EventStatus, Severity, Source } from "@prisma/client";
import { PipelineSignal } from "@/lib/pipeline/extraction";
import { clamp } from "@/lib/utils";

const TRUST_SCORE_WEIGHT = 0.25;
const CONFIRMED_CONFIDENCE_BOOST = 0.15;
const UNCERTAIN_CONFIDENCE_PENALTY = 0.1;
const AUTO_PUBLISH_CONFIDENCE_THRESHOLD = 0.8;
const AUTO_PUBLISH_LOCATION_CONFIDENCE_THRESHOLD = 0.6;

const HIGH_SEVERITY_ESCALATION_TERMS = ["death", "deaths", "hospitalized", "evacuation", "critical infrastructure"];
const CRITICAL_SEVERITY_ESCALATION_TERMS = ["mass casualty", "catastrophic", "state of emergency"];

export function scoreCandidate(input: {
  category: EventCategory;
  severity: Severity;
  confidence: number;
  locationConfidence: number;
  source: Pick<Source, "trustScore">;
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
    severity = Severity.HIGH;
    signals.push({
      kind: "severity",
      label: "severity:impact_terms",
      detail: "Text mentions deaths, hospitalization, evacuation, or critical infrastructure."
    });
  }

  if (CRITICAL_SEVERITY_ESCALATION_TERMS.some((word) => lower.includes(word))) {
    severity = Severity.CRITICAL;
    signals.push({
      kind: "severity",
      label: "severity:critical_terms",
      detail: "Text contains critical impact language."
    });
  }

  const canAutoPublish =
    confidence >= AUTO_PUBLISH_CONFIDENCE_THRESHOLD &&
    input.locationConfidence >= AUTO_PUBLISH_LOCATION_CONFIDENCE_THRESHOLD &&
    input.category !== EventCategory.UNKNOWN &&
    (severity === Severity.HIGH || severity === Severity.CRITICAL);

  if (canAutoPublish) {
    signals.push({
      kind: "confidence",
      label: "status:auto_published",
      detail: "High-confidence, high-severity located event can be published without manual review."
    });
  }

  const status = canAutoPublish ? EventStatus.PUBLISHED : EventStatus.NEEDS_REVIEW;

  return {
    confidence: Number(confidence.toFixed(2)),
    severity,
    status,
    signals
  };
}
