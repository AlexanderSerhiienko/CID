/**
 * Retroactive Groq enrichment for events processed without AI.
 *
 * Fetches events where aiEnhanced=false and extractionSource='rules',
 * runs Groq on their raw text, and updates category/severity/summary/location.
 * Rate-limited to one Groq call per 2.1s to stay within free-tier 30 RPM.
 */

import { prisma } from "@/lib/db";
import { extractWithAIThrottled, GROQ_MODEL } from "@/lib/pipeline/ai-extraction";
import { geocodeLocation } from "@/lib/pipeline/geocoder";
import { EventStatus, type Prisma } from "@prisma/client";

export type EnrichResult = {
  processed: number;
  enriched: number;
  skipped: number;
  errors: number;
};

export async function enrichEventsWithGroq(): Promise<EnrichResult> {
  const events = await prisma.riskEvent.findMany({
    where: { aiEnhanced: false, extractionSource: "rules" },
    include: {
      rawArticles: { take: 1, select: { title: true, rawText: true } }
    }
  });

  let enriched = 0;
  let skipped = 0;
  let errors = 0;

  for (const event of events) {
    const article = event.rawArticles[0];
    if (!article?.rawText) {
      skipped += 1;
      continue;
    }

    const aiResult = await extractWithAIThrottled(article.title, article.rawText);

    if (!aiResult || !aiResult.isRiskEvent) {
      skipped += 1;
      continue;
    }

    const signals = (event.signals as Prisma.JsonArray)
      .filter((s): s is Prisma.JsonObject => s !== null && typeof s === "object" && !Array.isArray(s))
      .filter((s) => !s["label"]?.toString().startsWith("ai:"));

    const updatedSignals: Prisma.InputJsonValue[] = [
      ...signals,
      {
        kind: "category",
        label: "ai:groq_extraction",
        detail: `Category, severity, and location extracted by Groq (${GROQ_MODEL}).`,
        weight: 0.1
      }
    ];

    // Enrich location if AI found a city and event has no coordinates yet
    let locationUpdate: Partial<Prisma.RiskEventUpdateInput> = {};
    if (aiResult.city && event.latitude === null) {
      const query = aiResult.country
        ? `${aiResult.city}, ${aiResult.country}`
        : aiResult.city;
      const geocoded = await geocodeLocation(query);
      if (geocoded) {
        locationUpdate = {
          city: aiResult.city,
          latitude: geocoded.lat,
          longitude: geocoded.lon,
          locationConfidence: Math.max(event.locationConfidence, geocoded.confidence),
          ...(!event.country ? { country: geocoded.country } : {})
        };
        updatedSignals.push({
          kind: "location",
          label: "location:ai-city",
          detail: `City extracted by AI (retroactive): "${aiResult.city}" → geocoded (${geocoded.lat.toFixed(4)}, ${geocoded.lon.toFixed(4)})`,
          weight: geocoded.confidence
        });
      }
    } else if (aiResult.country && !event.country) {
      locationUpdate = {
        country: aiResult.country,
        locationConfidence: Math.max(event.locationConfidence, 0.6)
      };
      updatedSignals.push({
        kind: "location",
        label: "location:ai-country",
        detail: `Country extracted by AI (retroactive): "${aiResult.country}"`,
        weight: 0.6
      });
    }

    const update: Prisma.RiskEventUpdateInput = {
      category: aiResult.category,
      severity: aiResult.severity,
      summary: aiResult.summary,
      aiEnhanced: true,
      extractionSource: "ai",
      signals: updatedSignals,
      ...locationUpdate
    };

    // Re-evaluate auto-publish: if now high-confidence + location resolved, publish
    const locationOk = !!(update.country ?? event.country);
    const highConfidence = event.confidence >= 0.7;
    if (
      highConfidence &&
      locationOk &&
      event.status === EventStatus.NEEDS_REVIEW
    ) {
      update.status = EventStatus.PUBLISHED;
    }

    try {
      await prisma.riskEvent.update({ where: { id: event.id }, data: update });
      enriched += 1;
    } catch {
      errors += 1;
    }
  }

  return { processed: events.length, enriched, skipped, errors };
}
