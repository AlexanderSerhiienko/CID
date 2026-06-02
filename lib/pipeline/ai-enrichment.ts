/**
 * Post-ingestion AI enrichment.
 *
 * Processes RawArticles with aiPending=true:
 *   1. Calls Groq to extract category, severity, summary, city, country.
 *   2. Geocodes via Nominatim if Groq found a city.
 *   3. Scores the candidate.
 *   4. Creates a RiskEvent and links it to the RawArticle.
 *
 * Keeping this step separate from ingestion means RSS fetching is always fast
 * and Groq rate-limiting never blocks the ingest endpoint.
 */

import { EventCategory, EventStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { extractEventFromArticle, CONFIDENCE_CATEGORY_BONUS } from "@/lib/pipeline/extraction";
import { extractWithAIThrottled } from "@/lib/pipeline/ai-extraction";
import { geocodeLocation } from "@/lib/pipeline/geocoder";
import { scoreCandidate } from "@/lib/pipeline/scoring";
import { isDuplicateCandidate } from "@/lib/pipeline/deduplication";

const BATCH_SIZE = 10;       // ~50s at 5s/call — fits inside a 60s serverless window
const LOOKBACK_DAYS = 7;     // only enrich articles ingested in the last 7 days

export type EnrichmentResult = {
  processed: number; // AI ran and RiskEvent was created (or linked to existing)
  notRisk: number;   // AI said isRiskEvent=false — article stored, no event
  skipped: number;   // Groq unavailable or returned null — article stays pending
  remaining: number; // aiPending=true articles still waiting after this batch
};

export async function enrichPendingArticles(
  batchSize = BATCH_SIZE,
  articleId?: string
): Promise<EnrichmentResult> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1_000);

  const articles = await prisma.rawArticle.findMany({
    where: articleId
      ? { id: articleId, aiPending: true }
      : { aiPending: true, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: articleId ? 1 : batchSize,
    include: { source: { select: { id: true, trustScore: true, type: true } } }
  });

  // Pre-load recent RiskEvents for dedup (same window used by ingestion)
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1_000);
  const recentEvents = await prisma.riskEvent.findMany({
    where: {
      createdAt: { gte: fiveDaysAgo },
      status: { in: [EventStatus.NEEDS_REVIEW, EventStatus.PUBLISHED] }
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, summary: true, category: true, country: true, city: true, confidence: true, createdAt: true }
  });

  let processed = 0;
  let notRisk = 0;
  let skipped = 0;

  for (const article of articles) {
    // Re-run deterministic extraction to get the full ExtractedEvent shape
    const extracted = extractEventFromArticle({ title: article.title, rawText: article.rawText });

    // Call Groq
    const aiResult = await extractWithAIThrottled(article.title, article.rawText);

    if (aiResult === false) {
      // Groq responded but output failed validation — permanent failure, don't retry
      await prisma.rawArticle.update({ where: { id: article.id }, data: { aiPending: false, aiRejected: true } });
      notRisk++;
      continue;
    }

    if (aiResult === null) {
      // Groq unavailable (network/429) — leave aiPending=true so next batch retries
      skipped++;
      continue;
    }

    if (!aiResult.isRiskEvent) {
      // AI says this is not an active risk event — flag it for human review instead of silently dropping
      await prisma.rawArticle.update({
        where: { id: article.id },
        data: { aiPending: false, aiRejected: true }
      });
      notRisk++;
      continue;
    }

    // Apply AI results over deterministic baseline
    if (extracted.category === EventCategory.UNKNOWN && aiResult.category !== EventCategory.UNKNOWN) {
      extracted.confidence = Math.min(1, Number((extracted.confidence + CONFIDENCE_CATEGORY_BONUS).toFixed(2)));
    }
    extracted.category = aiResult.category as EventCategory;
    extracted.severity = aiResult.severity as typeof extracted.severity;
    extracted.summary = aiResult.summary;
    if (aiResult.country && !extracted.country) extracted.country = aiResult.country;

    // Geocode if AI found a city
    let geocoderUsed = false;
    if (aiResult.city && !extracted.city) {
      const query = extracted.country ? `${aiResult.city}, ${extracted.country}` : aiResult.city;
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
    } else if (aiResult.country && extracted.locationConfidence === 0) {
      extracted.locationConfidence = 0.6;
      extracted.signals.push({
        kind: "location",
        label: "location:ai-country",
        detail: `Country extracted by AI: "${aiResult.country}"`,
        weight: 0.6
      });
    }

    extracted.signals.push({
      kind: "category",
      label: "ai:groq_extraction",
      detail: "Category, severity, summary and location extracted by Groq.",
      weight: 0.1
    });

    // Dedup: check if a similar RiskEvent already exists
    const duplicate = recentEvents
      .filter((e) => e.category === extracted.category && (extracted.country === null || e.country === extracted.country))
      .find((e) => isDuplicateCandidate({ ...extracted, publishedAt: article.createdAt }, e));

    if (duplicate) {
      await prisma.$transaction(async (tx) => {
        await tx.rawArticle.update({
          where: { id: article.id },
          data: { riskEventId: duplicate.id, aiPending: false }
        });
        await tx.riskEvent.update({
          where: { id: duplicate.id },
          data: { confidence: Math.min(1, duplicate.confidence + 0.1) }
        });
      });
      duplicate.confidence = Math.min(1, duplicate.confidence + 0.1);
      processed++;
      continue;
    }

    // Score and create new RiskEvent
    const scored = scoreCandidate({
      category: extracted.category,
      severity: extracted.severity,
      confidence: extracted.confidence,
      locationConfidence: extracted.locationConfidence,
      source: article.source,
      rawText: article.rawText
    });

    const newEvent = await prisma.$transaction(async (tx) => {
      const event = await tx.riskEvent.create({
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
          signals: [...extracted.signals, ...scored.signals] as Prisma.InputJsonValue,
          sourceUrl: article.url,
          occurredAt: article.publishedAt ?? undefined,
          extractionSource: "ai",
          aiEnhanced: true,
          geocoderUsed
        }
      });
      await tx.rawArticle.update({
        where: { id: article.id },
        data: { riskEventId: event.id, aiPending: false }
      });
      return event;
    });

    recentEvents.push({
      id: newEvent.id, title: newEvent.title, summary: newEvent.summary,
      category: newEvent.category, country: newEvent.country, city: newEvent.city,
      confidence: newEvent.confidence, createdAt: newEvent.createdAt
    });
    processed++;
  }

  const remaining = await prisma.rawArticle.count({
    where: { aiPending: true, createdAt: { gte: since } }
  });

  return { processed, notRisk, skipped, remaining };
}

// ── Per-event enrichment ──────────────────────────────────────────────────────
// Updates an existing RiskEvent with Groq extraction results.
// Used by the "Enrich" button in the review queue alongside Approve/Reject/Edit/Merge.

export type EventEnrichmentResult =
  | { ok: true; notRisk: false }
  | { ok: true; notRisk: true }
  | { ok: false; error: string };

export async function enrichEvent(eventId: string): Promise<EventEnrichmentResult> {
  const event = await prisma.riskEvent.findUnique({
    where: { id: eventId },
    include: { rawArticles: { take: 1, select: { rawText: true } } }
  });

  if (!event) return { ok: false, error: "Event not found" };
  if (event.aiEnhanced) return { ok: true, notRisk: false }; // already enriched
  const rawText = event.rawArticles[0]?.rawText ?? "";

  const aiResult = await extractWithAIThrottled(event.title, rawText);
  if (aiResult === null) return { ok: false, error: "AI unavailable or rate-limited" };
  if (aiResult === false) return { ok: false, error: "AI output failed validation" };
  if (!aiResult.isRiskEvent) return { ok: true, notRisk: true };

  // Geocode if AI found a city that the event doesn't have yet
  let geocoderUsed = event.geocoderUsed;
  const locationPatch: Record<string, unknown> = {};

  if (aiResult.city && !event.city) {
    const aiCountry = aiResult.country ?? event.country ?? undefined;
    const query = aiCountry ? `${aiResult.city}, ${aiCountry}` : aiResult.city;
    const geocoded = await geocodeLocation(query);
    if (geocoded) {
      geocoderUsed = true;
      locationPatch.city = aiResult.city;
      locationPatch.latitude = geocoded.lat;
      locationPatch.longitude = geocoded.lon;
      locationPatch.locationConfidence = Math.max(event.locationConfidence, geocoded.confidence);
    }
  } else if (aiResult.country && !event.country) {
    locationPatch.country = aiResult.country;
    if (event.locationConfidence === 0) locationPatch.locationConfidence = 0.6;
  }

  // Confidence bonus if AI resolved an UNKNOWN category
  const confidenceBonus =
    event.category === EventCategory.UNKNOWN && aiResult.category !== EventCategory.UNKNOWN
      ? CONFIDENCE_CATEGORY_BONUS
      : 0;

  await prisma.riskEvent.update({
    where: { id: eventId },
    data: {
      category: aiResult.category as EventCategory,
      severity: aiResult.severity as typeof event.severity,
      summary: aiResult.summary,
      aiEnhanced: true,
      extractionSource: "ai",
      geocoderUsed,
      confidence: Math.min(1, Number((event.confidence + confidenceBonus).toFixed(2))),
      ...locationPatch
    }
  });

  return { ok: true, notRisk: false };
}
