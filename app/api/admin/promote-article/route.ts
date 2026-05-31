import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";
import { extractEventFromArticle } from "@/lib/pipeline/extraction";
import { scoreCandidate } from "@/lib/pipeline/scoring";
import { Prisma } from "@prisma/client";

const schema = z.object({ articleId: z.string() });

/**
 * Manually promote an AI-rejected RawArticle into a RiskEvent.
 * Uses deterministic extraction (no Groq) — reviewer will triage in the queue.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const body = schema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "articleId required" }, { status: 400 });

  const article = await prisma.rawArticle.findUnique({
    where: { id: body.data.articleId },
    include: { source: { select: { id: true, trustScore: true, type: true } } }
  });

  if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });
  if (article.riskEventId) return NextResponse.json({ error: "Already linked to an event" }, { status: 409 });

  const extracted = extractEventFromArticle({ title: article.title, rawText: article.rawText });
  const scored = scoreCandidate({
    category: extracted.category,
    severity: extracted.severity,
    confidence: extracted.confidence,
    locationConfidence: extracted.locationConfidence,
    source: article.source,
    rawText: article.rawText
  });

  const event = await prisma.$transaction(async (tx) => {
    const e = await tx.riskEvent.create({
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
        status: "NEEDS_REVIEW", // always goes to review — human overrode AI
        signals: [...extracted.signals, ...scored.signals] as Prisma.InputJsonValue,
        sourceUrl: article.url,
        occurredAt: article.publishedAt ?? undefined,
        extractionSource: "rules",
        aiEnhanced: false,
        geocoderUsed: false
      }
    });
    await tx.rawArticle.update({
      where: { id: article.id },
      data: { riskEventId: e.id, aiRejected: false }
    });
    return e;
  });

  return NextResponse.json({ eventId: event.id });
}
