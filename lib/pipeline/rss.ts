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

  let createdArticles = 0;
  let duplicateArticles = 0;
  let candidateEvents = 0;

  for (const item of feed.items) {
    const itemUrl = item.link ? normalizeUrl(item.link) : null;
    const title = item.title?.trim();

    if (!itemUrl || !title) {
      continue;
    }

    const rawText = stripHtml(
      [item.content, item.contentSnippet, item.summary, item.title].filter(Boolean).join("\n")
    );
    const hash = contentHash(`${title}\n${rawText}`);
    const publishedAt = parseDate(item.isoDate ?? item.pubDate);

    const existingArticle = await prisma.rawArticle.findFirst({
      where: {
        OR: [{ url: itemUrl }, { contentHash: hash }]
      },
      select: { id: true }
    });

    if (existingArticle) {
      duplicateArticles += 1;
      continue;
    }

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

    // Nominatim fallback: resolve lat/lon when dictionary had no match and GeoRSS is absent
    if (!geoCoords && extracted.country === null && extracted.isLikelyRiskEvent) {
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

    // AI enhancement: improve category, severity, summary via Groq (free tier).
    // Only runs if GROQ_API_KEY is set and article looks like a risk event.
    // Skipped for GeoRSS feeds (USGS, GDACS) — coordinates already precise, no need for AI.
    // Falls back to rules silently on any error.
    if (extracted.isLikelyRiskEvent && !geoCoords) {
      const aiResult = await extractWithAI(title, rawText);
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

    const article = await prisma.rawArticle.create({
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

    if (!extracted.isLikelyRiskEvent) {
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

    const existingEvents = await prisma.riskEvent.findMany({
      where: {
        category: extracted.category,
        country: extracted.country ?? undefined
      },
      take: 25,
      orderBy: { createdAt: "desc" }
    });

    const duplicateEvent = existingEvents.find((event) =>
      isDuplicateCandidate({ ...extracted, publishedAt }, event)
    );

    if (duplicateEvent) {
      await prisma.rawArticle.update({
        where: { id: article.id },
        data: { riskEventId: duplicateEvent.id }
      });

      await prisma.riskEvent.update({
        where: { id: duplicateEvent.id },
        data: {
          confidence: Math.min(1, duplicateEvent.confidence + DUPLICATE_CONFIDENCE_INCREMENT)
        }
      });
      continue;
    }

    await prisma.riskEvent.create({
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
        rawArticles: {
          connect: { id: article.id }
        }
      }
    });
    candidateEvents += 1;
  }

  await prisma.source.update({
    where: { id: sourceId },
    data: { lastIngestedAt: new Date(), lastError: null }
  });

  return { sourceId, createdArticles, duplicateArticles, candidateEvents };
}
