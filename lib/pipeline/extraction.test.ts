import { describe, expect, it } from "vitest";
import { EventCategory, EventStatus, Severity } from "@prisma/client";
import { extractEventFromArticle } from "@/lib/pipeline/extraction";
import { scoreCandidate } from "@/lib/pipeline/scoring";

describe("extractEventFromArticle", () => {
  it("classifies disease outbreak articles with known locations", () => {
    const event = extractEventFromArticle({
      title: "Health officials confirm hantavirus cases in Patagonia",
      rawText: "Argentina confirmed new hantavirus cases near Patagonia. Patients were hospitalized."
    });

    expect(event.category).toBe(EventCategory.DISEASE_OUTBREAK);
    expect(event.isLikelyRiskEvent).toBe(true);
    expect(event.country).toBe("Argentina");
    expect(event.severity).toBe(Severity.MEDIUM);
    expect(event.signals.map((signal) => signal.label)).toEqual(
      expect.arrayContaining([
        "keyword:cases",
        "category:DISEASE_OUTBREAK",
        "location:Argentina"
      ])
    );
  });

  it("keeps vague article locations low confidence for review", () => {
    const event = extractEventFromArticle({
      title: "Possible incident reported near the capital",
      rawText: "Officials are investigating possible disruption near the capital."
    });

    expect(event.category).toBe(EventCategory.TRANSPORT_DISRUPTION);
    expect(event.locationConfidence).toBe(0);
    expect(event.signals).toContainEqual(
      expect.objectContaining({
        label: "location:unknown"
      })
    );
  });

  it("classifies drought as a natural disaster", () => {
    const event = extractEventFromArticle({
      title: "Drought is ongoing in Australia",
      rawText: "The drought notification level is orange in Australia."
    });

    expect(event.category).toBe(EventCategory.NATURAL_DISASTER);
    expect(event.isLikelyRiskEvent).toBe(true);
  });

  it("maps country-level GDACS-style titles to country coordinates", () => {
    const event = extractEventFromArticle({
      title: "Drought is on going in Madagascar",
      rawText: "The Drought notification level is Orange."
    });

    expect(event.country).toBe("Madagascar");
    expect(event.city).toBeNull();
    expect(event.latitude).toBeCloseTo(-18.7669);
    expect(event.locationConfidence).toBe(0.65);
    expect(event.signals).toContainEqual(
      expect.objectContaining({
        label: "location:Madagascar"
      })
    );
  });

  it("prefers the event location in the title over organization places in body text", () => {
    const event = extractEventFromArticle({
      title: "Sudan Crisis Situation Analysis",
      rawText: "Briefing prepared in New York after humanitarian updates."
    });

    expect(event.country).toBe("Sudan");
    expect(event.city).toBeNull();
  });

  it("matches longer country aliases before shorter nested aliases", () => {
    const event = extractEventFromArticle({
      title: "Escalating Violence in South Sudan",
      rawText: "Reports mention conflict and emergency displacement."
    });

    expect(event.country).toBe("South Sudan");
  });

  it("maps country fields embedded in humanitarian update titles", () => {
    const event = extractEventFromArticle({
      title: "IOM's CCCM New Arrival Flash update (Ancuabe | Cabo Delgado | Mozambique - 19 May 2026)",
      rawText: "Country: Mozambique. Escalating attacks triggered displacement."
    });

    expect(event.country).toBe("Mozambique");
    expect(event.locationConfidence).toBe(0.65);
  });

  it("maps GDACS alerts for countries without city-level data", () => {
    const event = extractEventFromArticle({
      title: "Green flood alert in Malaysia",
      rawText: "A green flood alert is active."
    });

    expect(event.country).toBe("Malaysia");
    expect(event.latitude).toBeCloseTo(4.2105);
  });

  it("classifies USGS magnitude titles as natural disasters", () => {
    const event = extractEventFromArticle({
      title: "M 4.7 - 184 km NE of Bamboo Flat, India",
      rawText: "USGS earthquake feed item."
    });

    expect(event.category).toBe(EventCategory.NATURAL_DISASTER);
    expect(event.isLikelyRiskEvent).toBe(true);
    expect(event.riskSignals).toEqual(expect.arrayContaining(["earthquake", "magnitude"]));
    expect(event.country).toBe("India");
  });

  it("classifies USGS magnitude titles with 2-decimal magnitudes as natural disasters", () => {
    const event = extractEventFromArticle({
      title: "M 5.30 - 12 km NNE of Pahala, Hawaii",
      rawText: "USGS earthquake feed item."
    });

    expect(event.category).toBe(EventCategory.NATURAL_DISASTER);
    expect(event.isLikelyRiskEvent).toBe(true);
    expect(event.riskSignals).toEqual(expect.arrayContaining(["earthquake", "magnitude"]));
    expect(event.severity).toBe(Severity.MEDIUM);
  });

  it("gives MEDIUM severity a lower confidence bonus than HIGH", () => {
    const medium = extractEventFromArticle({
      title: "Confirmed breach at hospital network in France",
      rawText: "The breach was confirmed affecting hospital systems in France."
    });
    const high = extractEventFromArticle({
      title: "Deaths reported after earthquake in Japan",
      rawText: "Multiple deaths confirmed following major earthquake in Japan."
    });

    expect(medium.severity).toBe(Severity.MEDIUM);
    expect(high.severity).toBe(Severity.HIGH);
    expect(high.confidence).toBeGreaterThan(medium.confidence);
  });

  it("does not classify firewall text as a wildfire", () => {
    const event = extractEventFromArticle({
      title: "CISA releases firewall hardening advisory",
      rawText: "Administrators should patch exploited vulnerabilities and review firewall rules."
    });

    expect(event.category).toBe(EventCategory.UNKNOWN);
  });

  it("filters obvious non-incident public health news", () => {
    const event = extractEventFromArticle({
      title: "WHO Member States agree to extend negotiations on key annex",
      rawText: "WHO Member States agreed to extend negotiations on a policy annex ahead of the World Health Assembly."
    });

    expect(event.isLikelyRiskEvent).toBe(false);
  });
});

describe("scoreCandidate", () => {
  it("routes uncertain candidates to human review", () => {
    const score = scoreCandidate({
      category: EventCategory.UNKNOWN,
      severity: Severity.LOW,
      confidence: 0.2,
      locationConfidence: 0,
      source: { trustScore: 0.4 },
      rawText: "possible incident"
    });

    expect(score.status).toBe(EventStatus.NEEDS_REVIEW);
  });

  it("raises severity when deaths are mentioned", () => {
    const score = scoreCandidate({
      category: EventCategory.NATURAL_DISASTER,
      severity: Severity.MEDIUM,
      confidence: 0.6,
      locationConfidence: 0.8,
      source: { trustScore: 0.9 },
      rawText: "confirmed deaths and evacuation after flood"
    });

    expect(score.severity).toBe(Severity.HIGH);
    expect(score.signals).toContainEqual(
      expect.objectContaining({
        label: "confidence:confirmed"
      })
    );
    expect(score.signals).toContainEqual(
      expect.objectContaining({
        label: "severity:impact_terms"
      })
    );
  });

  it("does not downgrade CRITICAL severity when HIGH escalation terms are present", () => {
    const score = scoreCandidate({
      category: EventCategory.POLITICAL_UNREST,
      severity: Severity.CRITICAL,
      confidence: 0.8,
      locationConfidence: 0.7,
      source: { trustScore: 0.9 },
      rawText: "confirmed deaths reported after major attack"
    });

    // Text contains HIGH escalation term ("deaths") but no CRITICAL term.
    // Severity must stay CRITICAL, not be downgraded to HIGH.
    expect(score.severity).toBe(Severity.CRITICAL);
  });

  it("auto-publishes confident high-severity located candidates", () => {
    const score = scoreCandidate({
      category: EventCategory.NATURAL_DISASTER,
      severity: Severity.MEDIUM,
      confidence: 0.7,
      locationConfidence: 0.65,
      source: { trustScore: 0.9 },
      rawText: "confirmed flood emergency with evacuation and deaths"
    });

    expect(score.status).toBe(EventStatus.PUBLISHED);
  });
});
