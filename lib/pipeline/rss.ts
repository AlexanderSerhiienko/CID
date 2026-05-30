import Parser from "rss-parser";
import { EventCategory, EventStatus } from "@prisma/client";
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

// Groq circuit breaker: open after N consecutive null returns, reset after 5 minutes.
// Module-level so a Groq outage trips the circuit globally — if Groq is down
// for one source it's down for all of them, and stalling per-article is wasteful.
const GROQ_CIRCUIT_THRESHOLD = 3;
const GROQ_CIRCUIT_RESET_MS = 5 * 60 * 1_000;
let groqConsecutiveNulls = 0;
let groqCircuitOpenUntil = 0;

// Rate limiter: Groq free tier allows 30 RPM (1 request every 2 seconds).
// Track the last call timestamp and enforce a minimum gap to avoid 429s proactively.
const GROQ_MIN_INTERVAL_MS = 2_100; // slightly over 2s for safety margin
let groqLastCallAt = 0;

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

  // Enforce minimum gap between requests to stay within 30 RPM free-tier limit.
  const wait = groqLastCallAt + GROQ_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  groqLastCallAt = Date.now();

  const result = await extractWithAI(title, rawText);

  if (result === null) {
    groqConsecutiveNulls += 1;
    if (groqConsecutiveNulls >= GROQ_CIRCUIT_THRESHOLD) {
      groqCircuitOpenUntil = Date.now() + GROQ_CIRCUIT_RESET_MS;
      console.warn(
        `[groq] Circuit opened after ${GROQ_CIRCUIT_THRESHOLD} consecutive failures. ` +
          `Skipping AI extraction for ${GROQ_CIRCUIT_RESET_MS / 60_000} minutes.`
      );
      // Do NOT reset groqConsecutiveNulls here — groqCircuitOpenUntil already gates
      // all subsequent calls, and the next successful Groq response resets it to 0.
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
    // Still mark the source as successfully checked even when the feed is empty.
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastIngestedAt: new Date(), lastError: null }
    });
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

  // Pre-load recent events for in-memory event dedup (avoids N+1 per candidate).
  // Only fetch the fields needed by isDuplicateCandidate + the confidence field
  // used for the duplicate-found update. Omitting signals, sourceUrl, etc. keeps
  // the payload small when there are hundreds of events in the 5-day window.
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1_000);
  type DedupEvent = {
    id: string;
    title: string;
    summary: string;
    category: EventCategory;
    country: string | null;
    city: string | null;
    confidence: number;
    createdAt: Date;
  };
  const recentEvents: DedupEvent[] = await prisma.riskEvent.findMany({
    where: {
      createdAt: { gte: fiveDaysAgo },
      // Exclude REJECTED and DRAFT events — linking new articles to dead events
      // buries evidence silently and prevents it from reaching the review queue.
      status: { in: [EventStatus.NEEDS_REVIEW, EventStatus.PUBLISHED] }
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      summary: true,
      category: true,
      country: true,
      city: true,
      confidence: true,
      createdAt: true
    }
  });

  let createdArticles = 0;
  let duplicateArticles = 0;
  let candidateEvents = 0;

  try {
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

    // Nominatim: call when no GeoRSS and no city-level precision yet.
    // country may already be set from the static dictionary (centroid coords),
    // but Nominatim can refine to an actual city coordinate.
    let geocoderUsed = false;
    if (!geoCoords && extracted.city === null && extracted.isLikelyRiskEvent) {
      const query = extracted.country
        ? `${title}, ${extracted.country}`
        : title;
      const geocoded = await geocodeLocation(query);
      if (geocoded) {
        geocoderUsed = true;
        // Trust existing static-dict country over Nominatim's country string
        if (!extracted.country) extracted.country = geocoded.country;
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

    // Event dedup via in-memory filter — run before AI extraction so:
    // (a) we use the rules-based category that is consistent with how existing events
    //     were classified when they were first created, and
    // (b) we avoid wasting Groq API calls on articles that turn out to be duplicates.
    const duplicateEvent = recentEvents
      .filter(
        (e) =>
          e.category === extracted.category &&
          (extracted.country === null || e.country === extracted.country)
      )
      .find((e) => isDuplicateCandidate({ ...extracted, publishedAt }, e));

    if (duplicateEvent) {
      // Atomic: create article + link to existing event.
      // In-memory confidence is updated AFTER the transaction commits so that
      // a DB failure leaves the snapshot consistent with the database — if the
      // transaction throws, the exception propagates and the line below is never
      // reached, preserving the invariant for any subsequent duplicates in this batch.
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
      // Keep in-memory snapshot current so additional duplicates in this batch
      // each get a fresh increment instead of all writing the same stale value.
      duplicateEvent.confidence = Math.min(1, duplicateEvent.confidence + DUPLICATE_CONFIDENCE_INCREMENT);
      createdArticles += 1;
      continue;
    }

    // AI extraction: guarded by circuit breaker. Runs after dedup to avoid wasting
    // Groq calls on duplicate articles. Skipped for GeoRSS feeds (coordinates already precise).
    // AI is now the primary source for category, severity, summary, and location.
    // Rules are the fallback when AI is unavailable.
    let aiEnhanced = false;
    const extractionSource = geoCoords ? "georss" : "rules";
    if (!geoCoords) {
      const aiResult = await extractWithAIGuarded(title, rawText);
      if (aiResult) {
        if (!aiResult.isRiskEvent) {
          // AI determined this is not an active risk event (policy report, stats, etc.) —
          // store raw record only and skip event creation.
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

        // Apply AI category/severity/summary as primary source.
        // If AI upgrades from UNKNOWN to a concrete category, apply the missed confidence bonus.
        // CONFIDENCE_CATEGORY_BONUS = 0.25 (matches lib/pipeline/extraction.ts)
        if (extracted.category === EventCategory.UNKNOWN && aiResult.category !== EventCategory.UNKNOWN) {
          extracted.confidence = Math.min(1, Number((extracted.confidence + 0.25).toFixed(2)));
        }
        extracted.category = aiResult.category;
        extracted.severity = aiResult.severity;
        extracted.summary = aiResult.summary;

        // Apply AI-extracted location when rules didn't find a city-level match.
        // AI city+country feeds Nominatim for precise coordinates.
        if (aiResult.city && extracted.city === null && !geocoderUsed) {
          const aiCountry = aiResult.country ?? extracted.country;
          const query = aiCountry ? `${aiResult.city}, ${aiCountry}` : aiResult.city;
          const geocoded = await geocodeLocation(query);
          if (geocoded) {
            geocoderUsed = true;
            extracted.city = aiResult.city;
            if (!extracted.country) extracted.country = geocoded.country;
            extracted.latitude = geocoded.lat;
            extracted.longitude = geocoded.lon;
            extracted.locationConfidence = Math.max(extracted.locationConfidence, geocoded.confidence);
            extracted.signals.push({
              kind: "location",
              label: "location:ai-city",
              detail: `City extracted by AI: "${aiResult.city}" → geocoded (${geocoded.lat.toFixed(4)}, ${geocoded.lon.toFixed(4)})`,
              weight: geocoded.confidence
            });
          }
        } else if (aiResult.country && extracted.country === null) {
          // AI found country but no city — use as country-level fallback
          extracted.country = aiResult.country;
          extracted.signals.push({
            kind: "location",
            label: "location:ai-country",
            detail: `Country extracted by AI: "${aiResult.country}"`,
            weight: 0.6
          });
          if (extracted.locationConfidence === 0) extracted.locationConfidence = 0.6;
        }

        extracted.signals.push({
          kind: "category",
          label: "ai:groq_extraction",
          detail: `Category, severity, and location extracted by Groq (${GROQ_MODEL}).`,
          weight: 0.1
        });
        aiEnhanced = true;
      }
    }

    // Score only when actually creating a new event — not needed for the duplicate path above
    const scored = scoreCandidate({
      category: extracted.category,
      severity: extracted.severity,
      confidence: extracted.confidence,
      locationConfidence: extracted.locationConfidence,
      source,
      rawText
    });

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
          rawArticles: { connect: { id: article.id } },
          extractionSource,
          aiEnhanced,
          geocoderUsed
        }
      });
    });

    // Keep dedup cache current so later items in this batch can match the new event
    recentEvents.push({
      id: newEvent.id,
      title: newEvent.title,
      summary: newEvent.summary,
      category: newEvent.category,
      country: newEvent.country,
      city: newEvent.city,
      confidence: newEvent.confidence,
      createdAt: newEvent.createdAt
    });
    createdArticles += 1;
    candidateEvents += 1;
  }

  } catch (err) {
    // DB/transaction errors inside the article loop are captured here so they
    // are visible in the admin dashboard via source.lastError.
    // The update is best-effort: if the DB is also unavailable we must not swallow
    // the original error, so any failure here is silently ignored.
    try {
      const errorMessage = err instanceof Error ? err.message : "Pipeline error during article processing";
      await prisma.source.update({
        where: { id: sourceId },
        data: { lastError: errorMessage }
      });
    } catch {
      // best-effort — ignore so the original error always propagates
    }
    throw err;
  }

  await prisma.source.update({
    where: { id: sourceId },
    data: { lastIngestedAt: new Date(), lastError: null }
  });

  return { sourceId, createdArticles, duplicateArticles, candidateEvents };
}
