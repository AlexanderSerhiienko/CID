export type MapRiskEvent = {
  id: string;
  title: string;
  category: string;
  severity: string;
  confidence: number;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type CountryRiskPoint = {
  country: string;
  mapKey: string;
  latitude: number;
  longitude: number;
  eventCount: number;
  riskScore: number;
  color: string;
  label: string;
  events: MapRiskEvent[];
};

const severityWeights: Record<string, number> = {
  LOW: 0.22,
  MEDIUM: 0.5,
  HIGH: 0.78,
  CRITICAL: 1
};

export const riskLegend = [
  { label: "No published risk", color: "#1f2937", min: -1, max: 0 },
  { label: "Low", color: "#16a34a", min: 0, max: 0.25 },
  { label: "Guarded", color: "#65a30d", min: 0.25, max: 0.4 },
  { label: "Elevated", color: "#ca8a04", min: 0.4, max: 0.58 },
  { label: "High", color: "#f59e0b", min: 0.58, max: 0.72 },
  { label: "Severe", color: "#dc2626", min: 0.72, max: 0.86 },
  { label: "Critical", color: "#7f1d1d", min: 0.86, max: 1 }
];

export function riskColor(score: number) {
  const bucket = riskLegend.find((item) => score >= item.min && score < item.max);
  return bucket?.color ?? riskLegend[riskLegend.length - 1].color;
}

export function riskLabel(score: number) {
  const bucket = riskLegend.find((item) => score >= item.min && score < item.max);
  return bucket?.label ?? riskLegend[riskLegend.length - 1].label;
}

export function aggregateCountryRisk(events: MapRiskEvent[]): CountryRiskPoint[] {
  const groups = new Map<string, MapRiskEvent[]>();

  for (const event of events) {
    if (!event.country || event.latitude === null || event.longitude === null) {
      continue;
    }

    const key = normalizeCountryName(event.country);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  return [...groups.entries()]
    .map(([mapKey, countryEvents]) => {
      const eventCount = countryEvents.length;
      const country = countryEvents[0]?.country ?? mapKey;
      const averageSeverity =
        countryEvents.reduce((total, event) => total + (severityWeights[event.severity] ?? 0.3), 0) /
        eventCount;
      const averageConfidence =
        countryEvents.reduce((total, event) => total + event.confidence, 0) / eventCount;
      const eventPressure = Math.min(eventCount / 5, 1);
      const rawRiskScore = clamp(
        averageSeverity * 0.78 + averageConfidence * 0.07 + eventPressure * 0.15
      );
      const maxSeverity = Math.max(
        ...countryEvents.map((event) => severityWeights[event.severity] ?? 0.3)
      );
      const riskScore = capRiskBySeverity(rawRiskScore, maxSeverity);
      const latitude =
        countryEvents.reduce((total, event) => total + Number(event.latitude), 0) / eventCount;
      const longitude =
        countryEvents.reduce((total, event) => total + Number(event.longitude), 0) / eventCount;

      return {
        country,
        mapKey,
        latitude,
        longitude,
        eventCount,
        riskScore: Number(riskScore.toFixed(2)),
        color: riskColor(riskScore),
        label: riskLabel(riskScore),
        events: countryEvents
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

export function riskLookup(events: MapRiskEvent[]) {
  return new Map(aggregateCountryRisk(events).map((point) => [point.mapKey, point]));
}

export function riskRadius(eventCount: number, riskScore: number) {
  return Math.round(12 + Math.min(eventCount, 8) * 3 + riskScore * 10);
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function capRiskBySeverity(score: number, maxSeverity: number) {
  if (maxSeverity <= severityWeights.LOW) {
    return Math.min(score, 0.34);
  }

  if (maxSeverity <= severityWeights.MEDIUM) {
    // Cap just below the "Elevated" bucket's upper boundary (exclusive max: 0.58)
    // so the score never lands exactly on 0.58 and falls into the "High" bucket.
    return Math.min(score, 0.57);
  }

  return score;
}

export function normalizeCountryName(country: string) {
  const normalized = country.trim().toLowerCase();
  const aliases: Record<string, string> = {
    "bolivia": "bolivia",
    "democratic republic of the congo": "dem. rep. congo",
    "dr congo": "dem. rep. congo",
    "drc": "dem. rep. congo",
    "russian federation": "russia",
    "south sudan": "s. sudan",
    "syrian arab republic": "syria",
    "united states": "united states of america",
    "usa": "united states of america",
    "u.s.": "united states of america"
  };

  return aliases[normalized] ?? normalized;
}
