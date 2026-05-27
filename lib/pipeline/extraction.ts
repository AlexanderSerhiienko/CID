import { EventCategory, Severity } from "@prisma/client";
import { stripHtml } from "@/lib/utils";

const CITY_MATCH_CONFIDENCE = 0.85;
const COUNTRY_MATCH_CONFIDENCE = 0.65;
const TEXT_LOCATION_CONFIDENCE_PENALTY = 0.15;
const MIN_LOCATION_CONFIDENCE = 0.4;
const CATEGORY_SIGNAL_WEIGHT = 0.25;
const CONFIDENCE_BASE = 0.25;
const CONFIDENCE_CATEGORY_BONUS = 0.25;
const CONFIDENCE_LOCATION_WEIGHT = 0.25;
const CONFIDENCE_SEVERITY_LOW_BONUS = 0.05;
const CONFIDENCE_SEVERITY_HIGH_BONUS = 0.15;

const HIGH_SEVERITY_KEYWORDS = ["death", "deaths", "fatal", "evacuation", "critical", "emergency"];
const MEDIUM_SEVERITY_KEYWORDS = ["confirmed", "hospitalized", "magnitude", "breach", "outage"];

type LocationResult = {
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  locationConfidence: number;
};

export type ExtractedEvent = {
  title: string;
  summary: string;
  category: EventCategory;
  isLikelyRiskEvent: boolean;
  riskSignals: string[];
  signals: PipelineSignal[];
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  locationConfidence: number;
  severity: Severity;
  confidence: number;
};

export type PipelineSignal = {
  kind: "category" | "location" | "severity" | "confidence" | "filter" | "keyword" | "source";
  label: string;
  detail?: string;
  weight?: number;
};

const categoryRules: Array<{ category: EventCategory; keywords: string[] }> = [
  {
    category: EventCategory.DISEASE_OUTBREAK,
    keywords: ["outbreak", "hantavirus", "cholera", "ebola", "influenza", "measles", "cases", "infection", "malaria", "health crisis"]
  },
  {
    category: EventCategory.NATURAL_DISASTER,
    keywords: ["earthquake", "flood", "wildfire", "forest fire", "cyclone", "hurricane", "landslide", "tsunami", "magnitude", "drought"]
  },
  {
    category: EventCategory.CYBER_ATTACK,
    keywords: ["ransomware", "cyberattack", "data breach", "malware", "phishing", "ddos"]
  },
  {
    category: EventCategory.TRANSPORT_DISRUPTION,
    keywords: ["airport", "rail", "train", "flight", "port", "transport", "strike", "disruption"]
  },
  {
    category: EventCategory.POLITICAL_UNREST,
    keywords: ["protest", "unrest", "riot", "clashes", "demonstration", "curfew", "armed conflict", "conflict", "killing", "violence"]
  },
  {
    category: EventCategory.FOOD_SAFETY_ALERT,
    keywords: ["recall", "contamination", "salmonella", "listeria", "food safety", "e. coli"]
  }
];

const knownLocations: Array<{
  country: string;
  city: string | null;
  latitude: number;
  longitude: number;
  aliases: string[];
}> = [
  { country: "Argentina", city: null, latitude: -38.4161, longitude: -63.6167, aliases: ["argentina", "patagonia"] },
  { country: "United States", city: "New York", latitude: 40.7128, longitude: -74.006, aliases: ["new york", "nyc"] },
  { country: "United States", city: null, latitude: 39.8283, longitude: -98.5795, aliases: ["united states", "u.s.", "usa"] },
  { country: "Japan", city: "Tokyo", latitude: 35.6762, longitude: 139.6503, aliases: ["tokyo"] },
  { country: "Japan", city: null, latitude: 36.2048, longitude: 138.2529, aliases: ["japan"] },
  { country: "France", city: "Paris", latitude: 48.8566, longitude: 2.3522, aliases: ["paris"] },
  { country: "France", city: null, latitude: 46.2276, longitude: 2.2137, aliases: ["france"] },
  { country: "Ukraine", city: "Kyiv", latitude: 50.4501, longitude: 30.5234, aliases: ["kyiv", "kiev"] },
  { country: "Ukraine", city: null, latitude: 48.3794, longitude: 31.1656, aliases: ["ukraine"] },
  { country: "Brazil", city: "Sao Paulo", latitude: -23.5558, longitude: -46.6396, aliases: ["sao paulo", "são paulo"] },
  { country: "Brazil", city: null, latitude: -14.235, longitude: -51.9253, aliases: ["brazil"] },
  { country: "India", city: "New Delhi", latitude: 28.6139, longitude: 77.209, aliases: ["new delhi", "delhi"] },
  { country: "India", city: null, latitude: 20.5937, longitude: 78.9629, aliases: ["india"] },
  { country: "Russian Federation", city: "Moscow", latitude: 55.7558, longitude: 37.6173, aliases: ["moscow"] },
  { country: "Russian Federation", city: null, latitude: 61.524, longitude: 105.3188, aliases: ["russian federation", "russia"] },
  { country: "Zambia", city: "Lusaka", latitude: -15.3875, longitude: 28.3228, aliases: ["lusaka"] },
  { country: "Zambia", city: null, latitude: -13.1339, longitude: 27.8493, aliases: ["zambia"] },
  { country: "Mexico", city: "Mexico City", latitude: 19.4326, longitude: -99.1332, aliases: ["mexico city"] },
  { country: "Mexico", city: null, latitude: 23.6345, longitude: -102.5528, aliases: ["mexico"] },
  { country: "Australia", city: "Canberra", latitude: -35.2809, longitude: 149.13, aliases: ["canberra"] },
  { country: "Australia", city: null, latitude: -25.2744, longitude: 133.7751, aliases: ["australia"] },
  { country: "Madagascar", city: null, latitude: -18.7669, longitude: 46.8691, aliases: ["madagascar"] },
  { country: "Venezuela", city: null, latitude: 6.4238, longitude: -66.5897, aliases: ["venezuela"] },
  { country: "Syrian Arab Republic", city: null, latitude: 34.8021, longitude: 38.9968, aliases: ["syrian arab republic", "syria"] },
  { country: "Sudan", city: null, latitude: 12.8628, longitude: 30.2176, aliases: ["sudan"] },
  { country: "South Sudan", city: null, latitude: 6.877, longitude: 31.307, aliases: ["south sudan"] },
  { country: "Afghanistan", city: null, latitude: 33.9391, longitude: 67.71, aliases: ["afghanistan"] },
  { country: "Pakistan", city: null, latitude: 30.3753, longitude: 69.3451, aliases: ["pakistan"] },
  { country: "Iran", city: null, latitude: 32.4279, longitude: 53.688, aliases: ["iran"] },
  { country: "Bangladesh", city: null, latitude: 23.685, longitude: 90.3563, aliases: ["bangladesh"] },
  { country: "Bahamas", city: null, latitude: 25.0343, longitude: -77.3963, aliases: ["bahamas", "the bahamas"] },
  { country: "Mozambique", city: null, latitude: -18.6657, longitude: 35.5296, aliases: ["mozambique"] },
  { country: "Indonesia", city: null, latitude: -0.7893, longitude: 113.9213, aliases: ["indonesia"] },
  { country: "Tonga", city: null, latitude: -21.179, longitude: -175.1982, aliases: ["tonga"] },
  { country: "Philippines", city: null, latitude: 12.8797, longitude: 121.774, aliases: ["philippines"] },
  { country: "Ecuador", city: null, latitude: -1.8312, longitude: -78.1834, aliases: ["ecuador", "galapagos"] },
  { country: "Nicaragua", city: null, latitude: 12.8654, longitude: -85.2072, aliases: ["nicaragua"] },
  { country: "Bolivia", city: null, latitude: -16.2902, longitude: -63.5887, aliases: ["bolivia"] },
  { country: "Honduras", city: null, latitude: 15.2, longitude: -86.2419, aliases: ["honduras"] },
  { country: "China", city: null, latitude: 35.8617, longitude: 104.1954, aliases: ["china"] },
  { country: "Malaysia", city: null, latitude: 4.2105, longitude: 101.9758, aliases: ["malaysia"] },
  { country: "Lebanon", city: null, latitude: 33.8547, longitude: 35.8623, aliases: ["lebanon"] },
  { country: "Tajikistan", city: null, latitude: 38.861, longitude: 71.2761, aliases: ["tajikistan"] },
  { country: "Turkmenistan", city: null, latitude: 38.9697, longitude: 59.5563, aliases: ["turkmenistan"] },
  { country: "Democratic Republic of the Congo", city: null, latitude: -4.0383, longitude: 21.7587, aliases: ["democratic republic of the congo", "dr congo", "drc"] },
  { country: "Uganda", city: null, latitude: 1.3733, longitude: 32.2903, aliases: ["uganda"] },
  { country: "Spain", city: "Tenerife", latitude: 28.2916, longitude: -16.6291, aliases: ["tenerife"] }
];

const riskSignalKeywords = [
  "alert",
  "attack",
  "breach",
  "cases",
  "clashes",
  "confirmed",
  "conflict",
  "contamination",
  "critical",
  "curfew",
  "cyclone",
  "death",
  "deaths",
  "drought",
  "earthquake",
  "emergency",
  "evacuation",
  "flood",
  "forest fire",
  "hantavirus",
  "hospitalized",
  "hurricane",
  "infection",
  "killing",
  "landslide",
  "malaria",
  "magnitude",
  "outage",
  "outbreak",
  "protest",
  "ransomware",
  "recall",
  "riot",
  "transport disruption",
  "tsunami",
  "unrest",
  "wildfire"
];

const nonIncidentKeywords = [
  "collaborating centres",
  "eliminated trachoma",
  "forum",
  "health statistics",
  "member states agree",
  "negotiations",
  "one health",
  "policy",
  "prequalifies",
  "results report",
  "summit",
  "world health day"
];

function detectCategory(text: string): EventCategory {
  const lower = text.toLowerCase();
  if (isMagnitudeEarthquakeText(lower)) {
    return EventCategory.NATURAL_DISASTER;
  }

  const match = categoryRules
    .map((rule) => ({
      category: rule.category,
      hits: rule.keywords.filter((keyword) => lower.includes(keyword)).length
    }))
    .sort((a, b) => b.hits - a.hits)[0];

  return match && match.hits > 0 ? match.category : EventCategory.UNKNOWN;
}

function detectLocation(input: { title: string; text: string }): LocationResult {
  const titleMatch = findLocation(input.title);
  if (titleMatch) {
    return titleMatch;
  }

  const textMatch = findLocation(input.text);
  if (textMatch) {
    return {
      ...textMatch,
      locationConfidence: Math.max(MIN_LOCATION_CONFIDENCE, Number((textMatch.locationConfidence - TEXT_LOCATION_CONFIDENCE_PENALTY).toFixed(2)))
    };
  }

  return {
    country: null,
    city: null,
    latitude: null,
    longitude: null,
    locationConfidence: 0
  };
}

function findLocation(text: string): LocationResult | null {
  const lower = text.toLowerCase();
  const match = knownLocations
    .flatMap((location) =>
      location.aliases.map((alias) => ({
        location,
        alias
      }))
    )
    .filter((candidate) => hasLocationAlias(lower, candidate.alias))
    .sort((a, b) => b.alias.length - a.alias.length)[0]?.location;

  if (!match) {
    return null;
  }

  const cityHit = match.city ? hasLocationAlias(lower, match.city.toLowerCase()) : false;

  return {
    country: match.country,
    city: cityHit ? match.city : null,
    latitude: match.latitude,
    longitude: match.longitude,
    locationConfidence: cityHit ? CITY_MATCH_CONFIDENCE : COUNTRY_MATCH_CONFIDENCE
  };
}

function hasLocationAlias(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(text);
}

function detectSeverity(text: string): Severity {
  const lower = text.toLowerCase();
  if (isMagnitudeEarthquakeText(lower)) {
    const magnitude = earthquakeMagnitude(lower);
    if (magnitude >= 7) {
      return Severity.HIGH;
    }
    if (magnitude >= 5) {
      return Severity.MEDIUM;
    }
  }

  if (HIGH_SEVERITY_KEYWORDS.some((word) => lower.includes(word))) {
    return Severity.HIGH;
  }

  if (MEDIUM_SEVERITY_KEYWORDS.some((word) => lower.includes(word))) {
    return Severity.MEDIUM;
  }

  return Severity.LOW;
}

function detectRiskSignals(text: string): string[] {
  const lower = text.toLowerCase();
  const signals = riskSignalKeywords.filter((keyword) => lower.includes(keyword));
  return isMagnitudeEarthquakeText(lower) ? [...new Set([...signals, "earthquake", "magnitude"])] : signals;
}

function isMagnitudeEarthquakeText(text: string): boolean {
  return /\bm\s?\d(?:\.\d)?\s+-/.test(text);
}

function earthquakeMagnitude(text: string): number {
  return Number(text.match(/\bm\s?(\d(?:\.\d)?)/)?.[1] ?? 0);
}

function buildExtractionSignals(input: {
  category: EventCategory;
  location: LocationResult;
  severity: Severity;
  riskSignals: string[];
  isLikelyRiskEvent: boolean;
}): PipelineSignal[] {
  const signals: PipelineSignal[] = input.riskSignals.slice(0, 8).map((keyword) => ({
    kind: "keyword",
    label: `keyword:${keyword}`,
    detail: `Matched risk keyword "${keyword}".`
  }));

  if (input.category !== EventCategory.UNKNOWN) {
    signals.push({
      kind: "category",
      label: `category:${input.category}`,
      detail: "Category selected by deterministic keyword rules.",
      weight: CATEGORY_SIGNAL_WEIGHT
    });
  }

  if (input.location.country) {
    signals.push({
      kind: "location",
      label: `location:${[input.location.city, input.location.country].filter(Boolean).join(", ")}`,
      detail: `Location dictionary match with ${Math.round(input.location.locationConfidence * 100)}% confidence.`,
      weight: input.location.locationConfidence
    });
  } else {
    signals.push({
      kind: "location",
      label: "location:unknown",
      detail: "No known location alias matched; reviewer should verify location.",
      weight: 0
    });
  }

  signals.push({
    kind: "severity",
    label: `severity:${input.severity}`,
    detail: "Severity selected by deterministic keyword rules."
  });

  if (!input.isLikelyRiskEvent) {
    signals.push({
      kind: "filter",
      label: "filtered:not_likely_incident",
      detail: "Article looked like non-incident news or had no strong risk signals."
    });
  }

  return signals;
}

function isNonIncidentNews(text: string): boolean {
  const lower = text.toLowerCase();
  return nonIncidentKeywords.some((keyword) => lower.includes(keyword));
}

function summarize(title: string, rawText: string): string {
  const text = stripHtml(rawText);
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0];
  return firstSentence && firstSentence.length > title.length ? firstSentence.slice(0, 280) : title;
}

export function extractEventFromArticle(input: { title: string; rawText: string }): ExtractedEvent {
  const combined = `${input.title}\n${stripHtml(input.rawText)}`;
  const location = detectLocation({ title: input.title, text: combined });
  const category = detectCategory(combined);
  const severity = detectSeverity(combined);
  const riskSignals = detectRiskSignals(combined);
  const isLikelyRiskEvent =
    riskSignals.length > 0 &&
    !(
      isNonIncidentNews(combined) &&
      !["outbreak", "cases", "death", "deaths", "emergency", "attack"].some((signal) =>
        riskSignals.includes(signal)
      )
    );
  const confidence =
    CONFIDENCE_BASE +
    (category === EventCategory.UNKNOWN ? 0 : CONFIDENCE_CATEGORY_BONUS) +
    location.locationConfidence * CONFIDENCE_LOCATION_WEIGHT +
    (severity === Severity.LOW ? CONFIDENCE_SEVERITY_LOW_BONUS : CONFIDENCE_SEVERITY_HIGH_BONUS);

  const signals = buildExtractionSignals({
    category,
    location,
    severity,
    riskSignals,
    isLikelyRiskEvent
  });

  return {
    title: input.title,
    summary: summarize(input.title, input.rawText),
    category,
    isLikelyRiskEvent,
    riskSignals,
    signals,
    severity,
    confidence: Number(confidence.toFixed(2)),
    ...location
  };
}
