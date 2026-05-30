import { describe, expect, it } from "vitest";
import { aggregateCountryRisk, normalizeCountryName, riskColor, riskRadius } from "@/lib/map/risk-scale";

describe("risk map scale", () => {
  it("assigns green, yellow, and red scale colors by score", () => {
    expect(riskColor(-1)).toBe("#1f2937");
    expect(riskColor(0.1)).toBe("#16a34a");
    expect(riskColor(0.5)).toBe("#ca8a04");
    expect(riskColor(0.9)).toBe("#7f1d1d");
  });

  it("normalizes application country names to Natural Earth names", () => {
    expect(normalizeCountryName("Syrian Arab Republic")).toBe("syria");
    expect(normalizeCountryName("South Sudan")).toBe("s. sudan");
    expect(normalizeCountryName("Democratic Republic of the Congo")).toBe("dem. rep. congo");
  });

  it("aggregates events by country and ranks higher risk first", () => {
    const points = aggregateCountryRisk([
      event({ country: "A", severity: "LOW", confidence: 0.5 }),
      event({ country: "B", severity: "CRITICAL", confidence: 0.95 }),
      event({ country: "B", severity: "HIGH", confidence: 0.9 })
    ]);

    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      country: "B",
      eventCount: 2,
      label: "Severe"
    });
    expect(points[1]).toMatchObject({
      country: "A",
      eventCount: 1
    });
  });

  it("never shows High label for a country with only MEDIUM events regardless of volume", () => {
    // Regression for cap-at-0.58 off-by-one: riskColor(0.58) hits the High bucket
    // because the Elevated bucket has exclusive upper bound (score < 0.58).
    // Cap must be 0.57 so capped scores stay within the Elevated bucket.
    const points = aggregateCountryRisk(
      Array.from({ length: 5 }, () =>
        event({ country: "A", severity: "MEDIUM", confidence: 1 })
      )
    );

    expect(points[0].riskScore).toBeLessThanOrEqual(0.57);
    expect(points[0].label).not.toBe("High");
    expect(points[0].label).not.toBe("Severe");
    expect(points[0].label).not.toBe("Critical");
  });

  it("does not turn low-severity confidence into high visual risk", () => {
    const points = aggregateCountryRisk([
      event({ country: "A", severity: "LOW", confidence: 1 }),
      event({ country: "A", severity: "LOW", confidence: 1 }),
      event({ country: "A", severity: "LOW", confidence: 1 }),
      event({ country: "A", severity: "LOW", confidence: 1 })
    ]);

    expect(points[0].riskScore).toBeLessThanOrEqual(0.34);
    expect(["Low", "Guarded"]).toContain(points[0].label);
  });

  it("increases bubble radius with event pressure and risk", () => {
    expect(riskRadius(4, 0.9)).toBeGreaterThan(riskRadius(1, 0.2));
  });
});

function event(overrides: Partial<Parameters<typeof aggregateCountryRisk>[0][number]>) {
  return {
    id: crypto.randomUUID(),
    title: "Risk event",
    category: "NATURAL_DISASTER",
    severity: "LOW",
    confidence: 0.5,
    country: "A",
    city: null,
    latitude: 10,
    longitude: 20,
    locationConfidence: 0.65,
    ...overrides
  };
}
