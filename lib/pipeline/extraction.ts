import { EventCategory, Severity } from "@prisma/client";
import { stripHtml } from "@/lib/utils";
import { countryCentroids } from "@/lib/map/country-centroids";

const CITY_MATCH_CONFIDENCE = 0.85;
const COUNTRY_MATCH_CONFIDENCE = 0.65;
const TEXT_LOCATION_CONFIDENCE_PENALTY = 0.15;
const MIN_LOCATION_CONFIDENCE = 0.4;
const CATEGORY_SIGNAL_WEIGHT = 0.25;
const CONFIDENCE_BASE = 0.25;
const CONFIDENCE_CATEGORY_BONUS = 0.25;
const CONFIDENCE_LOCATION_WEIGHT = 0.25;
const CONFIDENCE_SEVERITY_LOW_BONUS = 0.05;
const CONFIDENCE_SEVERITY_MEDIUM_BONUS = 0.10;
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

const knownLocations = countryCentroids.map((c) => ({
  country: c.country,
  city: c.city ?? null,
  latitude: c.latitude,
  longitude: c.longitude,
  aliases: c.aliases
}));

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
  return /\bm\s?\d+(?:\.\d+)?\s+-/.test(text);
}

function earthquakeMagnitude(text: string): number {
  return Number(text.match(/\bm\s?(\d+(?:\.\d+)?)/)?.[1] ?? 0);
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
    (severity === Severity.LOW
      ? CONFIDENCE_SEVERITY_LOW_BONUS
      : severity === Severity.MEDIUM
        ? CONFIDENCE_SEVERITY_MEDIUM_BONUS
        : CONFIDENCE_SEVERITY_HIGH_BONUS);

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
