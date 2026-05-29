/**
 * Nominatim geocoder — free OpenStreetMap geocoding.
 *
 * Policy: max 1 req/sec, User-Agent with contact, 5s timeout.
 * In-memory cache persists within a serverless container lifetime.
 * Gate with NOMINATIM_ENABLED=false to disable (default: enabled).
 */

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "CrisisIntelligenceDashboard/0.1 (alexanderserhiienko@gmail.com)";
const RATE_LIMIT_MS = 1100;
const TIMEOUT_MS = 5_000;
const GEOCODER_CONFIDENCE = 0.75;

export type GeocoderResult = {
  country: string;
  lat: number;
  lon: number;
  confidence: number;
};

// Module-level state — reused across requests in a warm serverless container.
let lastCallAt = 0;
const cache = new Map<string, GeocoderResult | null>();

function isEnabled(): boolean {
  return process.env.NOMINATIM_ENABLED !== "false";
}

async function rateLimit(): Promise<void> {
  const wait = RATE_LIMIT_MS - (Date.now() - lastCallAt);
  // Set lastCallAt eagerly before the sleep so concurrent callers (worker concurrency > 1)
  // see the updated timestamp immediately and don't both compute wait=0 and fire
  // simultaneous requests, violating Nominatim's mandatory 1 req/sec policy.
  lastCallAt = Date.now() + Math.max(0, wait);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

/**
 * Geocode a free-text location string (title, country name, city+country).
 * Returns null when Nominatim has no confident answer or on any error.
 */
export async function geocodeLocation(query: string): Promise<GeocoderResult | null> {
  if (!isEnabled()) return null;

  const key = query.trim().toLowerCase();
  if (!key) return null;

  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }

  await rateLimit();

  try {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      limit: "1",
      addressdetails: "1"
    });

    const resp = await fetch(`${NOMINATIM_BASE}?${params}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    if (!resp.ok) {
      // Do not cache transient errors — the server may recover and the location
      // should be retried on the next ingestion run.
      // 429: rate-limited — will succeed once the rate window expires.
      // 5xx: server-side outage — will succeed once Nominatim recovers.
      // Only cache definitive client errors (4xx except 429) as permanent nulls.
      if (resp.status === 429 || resp.status >= 500) return null;
      cache.set(key, null);
      return null;
    }

    const data = (await resp.json()) as unknown[];

    if (!Array.isArray(data) || data.length === 0) {
      cache.set(key, null);
      return null;
    }

    const hit = data[0] as Record<string, unknown>;
    const address = hit.address as Record<string, string> | undefined;

    const country =
      address?.country ??
      (typeof hit.display_name === "string"
        ? hit.display_name.split(",").pop()?.trim()
        : undefined) ??
      null;

    const lat = parseFloat(hit.lat as string);
    const lon = parseFloat(hit.lon as string);

    if (!country || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      cache.set(key, null);
      return null;
    }

    const result: GeocoderResult = { country, lat, lon, confidence: GEOCODER_CONFIDENCE };
    cache.set(key, result);
    return result;
  } catch {
    // Timeout, network error — don't cache so next run can retry
    return null;
  }
}
