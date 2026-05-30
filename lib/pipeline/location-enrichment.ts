/**
 * AI-powered location enrichment using Groq.
 *
 * When the deterministic pipeline resolves only a country (locationConfidence = 0.65),
 * this module asks Groq to extract the most specific place name from the article text,
 * then geocodes it via Nominatim to get precise coordinates.
 *
 * Gated by:
 *   - GROQ_API_KEY env var
 *   - Quality threshold: isLikelyRiskEvent, riskSignals >= 2, category != UNKNOWN
 *   - Circuit breaker: skips after consecutive failures
 */

import { EventCategory } from "@prisma/client";
import { geocodeLocation } from "@/lib/pipeline/geocoder";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";
const TIMEOUT_MS = 6_000;
const MIN_RISK_SIGNALS = 2;

// Circuit breaker — shared module state
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 15 * 60 * 1000; // 15 min
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

export type EnrichedLocation = {
  placeName: string;
  country: string;
  lat: number;
  lon: number;
};

/**
 * Quality gate — returns true only for events worth spending an AI call on.
 * Keeps Groq usage well within the free-tier daily limit.
 */
export function shouldEnrichLocation(params: {
  isLikelyRiskEvent: boolean;
  riskSignals: string[];
  category: EventCategory | string;
  locationConfidence: number;
  country: string | null;
}): boolean {
  return (
    params.isLikelyRiskEvent &&
    params.riskSignals.length >= MIN_RISK_SIGNALS &&
    params.category !== EventCategory.UNKNOWN &&
    params.locationConfidence < 0.75 &&
    params.country !== null
  );
}

/**
 * Ask Groq for the most specific place name mentioned in the article,
 * then geocode it. Returns null on any failure — pipeline continues unaffected.
 */
export async function enrichLocation(params: {
  title: string;
  rawText: string;
  country: string;
}): Promise<EnrichedLocation | null> {
  if (!process.env.GROQ_API_KEY) return null;
  if (Date.now() < circuitOpenUntil) return null;

  const placeName = await extractPlaceName(params);
  if (!placeName) return null;

  const geocoded = await geocodeLocation(`${placeName}, ${params.country}`);
  if (!geocoded) return null;

  return {
    placeName,
    country: geocoded.country,
    lat: geocoded.lat,
    lon: geocoded.lon,
  };
}

async function extractPlaceName(params: {
  title: string;
  rawText: string;
  country: string;
}): Promise<string | null> {
  const userContent =
    `Country: ${params.country}\n` +
    `Title: ${params.title}\n` +
    `Text: ${params.rawText.slice(0, 800)}`;

  try {
    const resp = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY!}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a geographic location extractor. " +
              "Given a news article about a crisis event, respond with ONLY the single most specific " +
              "place name mentioned (city, district, province, or region). " +
              "Do NOT include the country name. " +
              "If no specific sub-national location is mentioned, respond with exactly: NONE",
          },
          { role: "user", content: userContent },
        ],
        temperature: 0,
        max_tokens: 32,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!resp.ok) {
      recordFailure();
      return null;
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw || raw.toUpperCase() === "NONE" || raw.length > 100) {
      recordSuccess();
      return null;
    }

    recordSuccess();
    return raw;
  } catch {
    recordFailure();
    return null;
  }
}

function recordFailure() {
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_RESET_MS;
    console.warn(
      `[location-enrichment] Circuit opened after ${CIRCUIT_THRESHOLD} failures. ` +
        `Pausing for ${CIRCUIT_RESET_MS / 60_000} min.`
    );
  }
}

function recordSuccess() {
  consecutiveFailures = 0;
}
