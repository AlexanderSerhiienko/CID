import { EventCategory, EventStatus, Severity, Source } from "@prisma/client";
import { PipelineSignal } from "@/lib/pipeline/extraction";
import { clamp } from "@/lib/utils";

export function scoreCandidate(input: {
  category: EventCategory;
  severity: Severity;
  confidence: number;
  locationConfidence: number;
  source: Pick<Source, "trustScore">;
  rawText: string;
}) {
  const lower = input.rawText.toLowerCase();
  let confidence = input.confidence + input.source.trustScore * 0.25;
  const signals: PipelineSignal[] = [
    {
      kind: "source",
      label: "source:trust_score",
      detail: `Source trust score contributed ${Math.round(input.source.trustScore * 25)} confidence points.`,
      weight: input.source.trustScore
    }
  ];

  if (lower.includes("confirmed")) {
    confidence += 0.15;
    signals.push({
      kind: "confidence",
      label: "confidence:confirmed",
      detail: "Text mentions confirmed information.",
      weight: 0.15
    });
  }

  if (lower.includes("suspected") || lower.includes("possible")) {
    confidence -= 0.1;
    signals.push({
      kind: "confidence",
      label: "confidence:uncertain_language",
      detail: "Text mentions suspected or possible information.",
      weight: -0.1
    });
  }

  confidence = clamp(confidence, 0, 1);

  let severity = input.severity;
  if (["death", "deaths", "hospitalized", "evacuation", "critical infrastructure"].some((word) => lower.includes(word))) {
    severity = Severity.HIGH;
    signals.push({
      kind: "severity",
      label: "severity:impact_terms",
      detail: "Text mentions deaths, hospitalization, evacuation, or critical infrastructure."
    });
  }

  if (["mass casualty", "catastrophic", "state of emergency"].some((word) => lower.includes(word))) {
    severity = Severity.CRITICAL;
    signals.push({
      kind: "severity",
      label: "severity:critical_terms",
      detail: "Text contains critical impact language."
    });
  }

  const canAutoPublish =
    confidence >= 0.8 &&
    input.locationConfidence >= 0.6 &&
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
