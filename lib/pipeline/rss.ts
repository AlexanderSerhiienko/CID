import Parser from "rss-parser";
import { EventCategory, EventStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { contentHash } from "@/lib/pipeline/hash";
import { extractEventFromArticle, type PipelineSignal } from "@/lib/pipeline/extraction";
import { isDuplicateCandidate } from "@/lib/pipeline/deduplication";
import { scoreCandidate } from "@/lib/pipeline/scoring";
import { normalizeUrl, stripHtml } from "@/lib/utils";

const DUPLICATE_CONFIDENCE_INCREMENT = 0.1;
const GEORSS_LOCATION_CONFIDENCE = 0.9;

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

    if (geoCoords) {
      // ── GeoRSS PATH ────────────────────────────────────────────────────────
      // Coordinates come from the feed — create RawArticle + RiskEvent immediately.
      // No AI enrichment needed: location is already precise.

      if (!extracted.isLikelyRiskEvent) {
        await prisma.rawArticle.create({
          data: { sourceId: source.id, title, url: itemUrl, publishedAt, contentHash: hash, rawText }
        });
        createdArticles += 1;
        continue;
      }

      const geoDuplicate = recentEvents
        .filter((e) => e.category === extracted.category && (extracted.country === null || e.country === extracted.country))
        .find((e) => isDuplicateCandidate({ ...extracted, publishedAt: new Date() }, e));

      if (geoDuplicate) {
        await prisma.$transaction(async (tx) => {
          const article = await tx.rawArticle.create({
            data: { sourceId: source.id, title, url: itemUrl, publishedAt, contentHash: hash, rawText }
          });
          await tx.rawArticle.update({ where: { id: article.id }, data: { riskEventId: geoDuplicate.id } });
          await tx.riskEvent.update({
            where: { id: geoDuplicate.id },
            data: { confidence: Math.min(1, geoDuplicate.confidence + DUPLICATE_CONFIDENCE_INCREMENT) }
          });
        });
        geoDuplicate.confidence = Math.min(1, geoDuplicate.confidence + DUPLICATE_CONFIDENCE_INCREMENT);
        createdArticles += 1;
        continue;
      }

      const geoScored = scoreCandidate({
        category: extracted.category,
        severity: extracted.severity,
        confidence: extracted.confidence,
        locationConfidence: extracted.locationConfidence,
        source,
        rawText
      });

      const geoEvent = await prisma.$transaction(async (tx) => {
        const article = await tx.rawArticle.create({
          data: { sourceId: source.id, title, url: itemUrl, publishedAt, contentHash: hash, rawText }
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
            severity: geoScored.severity,
            confidence: geoScored.confidence,
            status: geoScored.status,
            signals: [...extracted.signals, ...geoScored.signals],
            sourceUrl: itemUrl,
            occurredAt: publishedAt ?? undefined,
            rawArticles: { connect: { id: article.id } },
            extractionSource: "georss",
            aiEnhanced: false,
            geocoderUsed: false
          }
        });
      });

      recentEvents.push({
        id: geoEvent.id, title: geoEvent.title, summary: geoEvent.summary,
        category: geoEvent.category, country: geoEvent.country, city: geoEvent.city,
        confidence: geoEvent.confidence, createdAt: geoEvent.createdAt
      });
      createdArticles += 1;
      candidateEvents += 1;

    } else {
      // ── NON-GeoRSS PATH ────────────────────────────────────────────────────
      // Save RawArticle only. AI enrichment (Groq + Nominatim + scoring) runs
      // separately via POST /api/admin/enrich, keeping ingestion fast.

      if (!extracted.isLikelyRiskEvent) {
        // Deterministic rules say this is not a risk event — store for audit, skip AI.
        await prisma.rawArticle.create({
          data: { sourceId: source.id, title, url: itemUrl, publishedAt, contentHash: hash, rawText, aiPending: false }
        });
        createdArticles += 1;
        continue;
      }

      // Check if this article covers an event already in the DB (GeoRSS or AI-enriched).
      // Category may be UNKNOWN here (rules-only) so dedup has limited recall —
      // the AI enrichment step re-checks after Groq resolves the category.
      const existingEvent = recentEvents
        .filter((e) => e.category === extracted.category && (extracted.country === null || e.country === extracted.country))
        .find((e) => isDuplicateCandidate({ ...extracted, publishedAt: new Date() }, e));

      if (existingEvent) {
        await prisma.$transaction(async (tx) => {
          const article = await tx.rawArticle.create({
            data: { sourceId: source.id, title, url: itemUrl, publishedAt, contentHash: hash, rawText, aiPending: false }
          });
          await tx.rawArticle.update({ where: { id: article.id }, data: { riskEventId: existingEvent.id } });
          await tx.riskEvent.update({
            where: { id: existingEvent.id },
            data: { confidence: Math.min(1, existingEvent.confidence + DUPLICATE_CONFIDENCE_INCREMENT) }
          });
        });
        existingEvent.confidence = Math.min(1, existingEvent.confidence + DUPLICATE_CONFIDENCE_INCREMENT);
        createdArticles += 1;
        continue;
      }

      // Queue for AI enrichment — no RiskEvent created yet.
      await prisma.rawArticle.create({
        data: { sourceId: source.id, title, url: itemUrl, publishedAt, contentHash: hash, rawText, aiPending: true }
      });
      createdArticles += 1;
      candidateEvents += 1; // pending enrichment
    }
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
