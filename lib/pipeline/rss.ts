import Parser from "rss-parser";
import { prisma } from "@/lib/db";
import { contentHash } from "@/lib/pipeline/hash";
import { extractEventFromArticle, type PipelineSignal } from "@/lib/pipeline/extraction";
import { isDuplicateCandidate } from "@/lib/pipeline/deduplication";
import { scoreCandidate } from "@/lib/pipeline/scoring";
import { geocodeLocation } from "@/lib/pipeline/geocoder";
import { extractWithAI, GROQ_MODEL } from "@/lib/pipeline/ai-extraction";
import { normalizeUrl, stripHtml } from "@/lib/utils";

const DUPLICATE_CONFIDENCE_INCREMENT = 0.1;
const GEORSS_LOCATION_CONFIDENCE = 0.9;

// Nominatim rate limiting: max 1 req/sec per their usage policy
const GEOCODE_MIN_INTERVAL_MS = 1_100;
let lastGeocodeMs = 0;

// Groq circuit breaker: open after N consecutive null returns, reset after 5 minutes
const GROQ_CIRCUIT_THRESHOLD = 3;
const GROQ_CIRCUIT_RESET_MS = 5 * 60 * 1_000;
let groqConsecutiveNulls = 0;
let groqCircuitOpenUntil = 0;

// Custom fields for GeoRSS (used by USGS Atom feed and others)
type GeoRssItem = {
  "georss:point"?: string;
  "geo:lat"?: string;
  "geo:long"?: string;
};

const parser = new Parser<Record<string, unknown>, GeoRssItem>({
  timeout: 10_000,
  headers: {
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    "User-Agent": "CrisisIntelligenceDashboard/0.1 (+local-dev)"
  },
  customFields: {
    item: [
      ["georss:point", "georss:point"],
      ["geo:lat", "geo:lat"],
      ["geo:long", "geo:long"]
    ]
  }
});

/**
 * Extract lat/lon from GeoRSS fields present on an RSS/Atom item.
 * Supports `georss:point` ("lat lon") and `geo:lat` / `geo:long` pair.
 * Returns null if no valid coordinates are found.
 */
export function parseGeoRssCoords(item: GeoRssItem): { lat: number; lon: number } | null {
  const point = item["georss:point"];
  if (point) {
    const parts = point.trim().split(/\s+/);
    if (parts.length === 2) {
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { lat, lon };
      }
    }
  }

  const lat = item["geo:lat"];
  const lon = item["geo:long"];
  if (lat && lon) {
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
      return { lat: parsedLat, lon: parsedLon };
    }
  }

  return null;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Enforces Nominatim's 1 req/sec usage policy by waiting if the last
 * geocode call was less than GEOCODE_MIN_INTERVAL_MS ago.
 */
async function throttleGeocode(): Promise<void> {
  const now = Date.now();
  const wait = lastGeocodeMs + GEOCODE_MIN_INTERVAL_MS - now;
  if (wait > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, wait));
  }
  lastGeocodeMs = Date.now();
}

/**
 * Wraps extractWithAI with a simple circuit breaker.
 * After GROQ_CIRCUIT_THRESHOLD consecutive null returns, skips Groq for
 * GROQ_CIRCUIT_RESET_MS to avoid stalling the pipeline on every article
 * during an outage or rate-limit period.
 */
async function extractWithAIGuarded(
  title: string,
  rawText: string
): Promise<Awaited<ReturnType<typeof extractWithAI>>> {
  if (!process.env.GROQ_API_KEY) return null; // not configured — skip tracking
  if (Date.now() < groqCircuitOpenUntil) return null; // circuit open

  const result = await extractWithAI(title, rawText);

  if (result === null) {
    groqConsecutiveNulls += 1;
    if (groqConsecutiveNulls >= GROQ_CIRCUIT_THRESHOLD) {
      groqCircuitOpenUntil = Date.now() + GROQ_CIRCUIT_RESET_MS;
      console.warn(
        `[groq] Circuit opened after ${GROQ_CIRCUIT_THRESHOLD} consecutive failures. ` +
          `Skipping AI extraction for ${GROQ_CIRCUIT_RESET_MS / 60_000} minutes.`
      );
      groqConsecutiveNulls = 0;
    }
  } else {
    groqConsecutiveNulls = 0;
  }

  return result;
}

export async function ingestRssSource(sourceId: string) {
  const source = await prisma.source.findUniqueOrThrow({
    where: { id: sourceId }
  });

  if (!source.enabled) {
    return { sourceId, createdArticles: 0, duplicateArticles: 0, candidateEvents: 0 };
  }

  let feed: Awaited<ReturnType<typeof parser.parseURL>>;
  try {
    feed = await parser.parseURL(source.url);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to fetch or parse feed";
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastError: errorMessage }
    });
    throw err;
  }

  // Pre-process feed items to avoid duplicate work in the loop
  type PreprocessedItem = {
    item: (typeof feed.items)[number];
    itemUrl: string;
    title: string;
    rawText: string;
    hash: string;
    publishedAt: Date | null;
  };

  const preprocessed: PreprocessedItem[] = [];
  for (const item of feed.items) {
    const itemUrl = item.link ? normalizeUrl(item.link) : null;
    const title = item.title?.trim();
    if (!itemUrl || !title) continue;
    const rawText = stripHtml(
      [item.content, item.contentSnippet, item.summary, item.title].filter(Boolean).join("\n")
    );
    const hash = contentHash(`${title}\n${rawText}`);
    const publishedAt = parseDate(item.isoDate ?? item.pubDate);
    preprocessed.push({ item, itemUrl, title, rawText, hash, publishedAt });
  }

  if (preprocessed.length === 0) {
    return { sourceId, createdArticles: 0, duplicateArticles: 0, candidateEvents: 0 };
  }

  // Batch dedup check: one query for all article URLs + hashes in this feed
  const existingArticleMatchers = await prisma.rawArticle.findMany({
    where: {
      OR: [
        { url: { in: preprocessed.map((i) => i.itemUrl) } },
        { contentHash: { in: preprocessed.map((i) => i.hash) } }
      ]
    },
    select: { url: true, contentHash: true }
  });
  const seenUrls = new Set(existingArticleMatchers.map((a) => a.url));
  const seenHashes = new Set(existingArticleMatchers.map((a) => a.contentHash));

  // Pre-load recent events for in-memory event dedup (avoids N+1 per candidate)
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1_000);
  const recentEvents = await prisma.riskEvent.findMany({
    where: { createdAt: { gte: fiveDaysAgo } },
    orderBy: { createdAt: "desc" }
  });

  let createdArticles = 0;
  let duplicateArticles = 0;
  let candidateEvents = 0;

  for (const { item, itemUrl, title, rawText, hash, publishedAt } of preprocessed) {
    // Article-level dedup (O(1) in-memory lookup)
    if (seenUrls.has(itemUrl) || seenHashes.has(hash)) {
      duplicateArticles += 1;
      continue;
    }
    // Track optimistically so later items in the same batch don't re-create
    seenUrls.add(itemUrl);
    seenHashes.add(hash);

    const extracted = extractEventFromArticle({ title, rawText });

    // Override location with GeoRSS coordinates when present — more accurate than text extraction
    const geoCoords = parseGeoRssCoords(item);
    if (geoCoords) {
      extracted.latitude = geoCoords.lat;
      extracted.longitude = geoCoords.lon;
      if (geoCoords.lat !== 0 || geoCoords.lon !== 0) {
        extracted.locationConfidence = Math.max(extracted.locationConfidence, GEORSS_LOCATION_CONFIDENCE);
        const geoSignal: PipelineSignal = {
          kind: "location",
          label: "location:georss",
          detail: `Coordinates from GeoRSS feed: ${geoCoords.lat.toFixed(4)}, ${geoCoords.lon.toFixed(4)}`,
          weight: GEORSS_LOCATION_CONFIDENCE
        };
        extracted.signals.push(geoSignal);
      }
    }

    // Nominatim fallback: rate-limited to respect the 1 req/sec policy
    if (!geoCoords && extracted.country === null && extracted.isLikelyRiskEvent) {
      await throttleGeocode();
      const geocoded = await geocodeLocation(title);
      if (geocoded) {
        extracted.country = geocoded.country;
        extracted.latitude = geocoded.lat;
        extracted.longitude = geocoded.lon;
        extracted.locationConfidence = Math.max(extracted.locationConfidence, geocoded.confidence);
        extracted.signals.push({
          kind: "location",
          label: "location:nominatim",
          detail: `Geocoded via Nominatim: ${geocoded.country} (${geocoded.lat.toFixed(4)}, ${geocoded.lon.toFixed(4)})`,
          weight: geocoded.confidence
        });
      }
    }

    // AI enhancement: guarded by circuit breaker to avoid stalling on Groq outages.
    // Skipped for GeoRSS feeds — coordinates are already precise.
    if (extracted.isLikelyRiskEvent && !geoCoords) {
      const aiResult = await extractWithAIGuarded(title, rawText);
      if (aiResult) {
        extracted.category = aiResult.category;
        extracted.severity = aiResult.severity;
        extracted.summary = aiResult.summary;
        extracted.signals.push({
          kind: "category",
          label: "ai:groq_extraction",
          detail: `Category and severity refined by Groq (${GROQ_MODEL}).`,
          weight: 0.1
        });
      }
    }

    // Event dedup via in-memory filter — no DB query per item
    const duplicateEvent = extracted.isLikelyRiskEvent
      ? recentEvents
          .filter(
            (e) =>
              e.category === extracted.category &&
              (extracted.country === null || e.country === extracted.country)
          )
          .find((e) => isDuplicateCandidate({ ...extracted, publishedAt }, e))
      : undefined;

    if (!extracted.isLikelyRiskEvent) {
      // Non-risk article: create the raw record only (no transaction needed — single write)
      await prisma.rawArticle.create({
        data: {
          sourceId: source.id,
          title,
          url: itemUrl,
          publishedAt,
          contentHash: hash,
          rawText
        }
      });
      createdArticles += 1;
      continue;
    }

    const scored = scoreCandidate({
      category: extracted.category,
      severity: extracted.severity,
      confidence: extracted.confidence,
      locationConfidence: extracted.locationConfidence,
      source,
      rawText
    });

    if (duplicateEvent) {
      // Atomic: create article + link to existing event
      await prisma.$transaction(async (tx) => {
        const article = await tx.rawArticle.create({
          data: {
            sourceId: source.id,
            title,
            url: itemUrl,
            publishedAt,
            contentHash: hash,
            rawText
          }
        });
        await tx.rawArticle.update({
          where: { id: article.id },
          data: { riskEventId: duplicateEvent.id }
        });
        await tx.riskEvent.update({
          where: { id: duplicateEvent.id },
          data: {
            confidence: Math.min(1, duplicateEvent.confidence + DUPLICATE_CONFIDENCE_INCREMENT)
          }
        });
      });
      createdArticles += 1;
      continue;
    }

    // Atomic: create article + new event together so a crash between them leaves no orphan
    const newEvent = await prisma.$transaction(async (tx) => {
      const article = await tx.rawArticle.create({
        data: {
          sourceId: source.id,
          title,
          url: itemUrl,
          publishedAt,
          contentHash: hash,
          rawText
        }
      });
      return tx.riskEvent.create({
        data: {
          title: extracted.title,
          summary: extracted.summary,
          category: extracted.category,
          country: extracted.country,
          city: extracted.city,
          latitude: extracted.latitude,
          longitude: extracted.longitude,
          locationConfidence: extracted.locationConfidence,
          severity: scored.severity,
          confidence: scored.confidence,
          status: scored.status,
          signals: [...extracted.signals, ...scored.signals],
          sourceUrl: itemUrl,
          occurredAt: publishedAt ?? undefined,
          rawArticles: { connect: { id: article.id } }
        }
      });
    });

    recentEvents.push(newEvent); // Keep in-memory cache current for the rest of this batch
    createdArticles += 1;
    candidateEvents += 1;
  }

  await prisma.source.update({
    where: { id: sourceId },
    data: { lastIngestedAt: new Date(), lastError: null }
  });

  return { sourceId, createdArticles, duplicateArticles, candidateEvents };
}
