import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";
import { enrichPendingArticles, enrichEvent } from "@/lib/pipeline/ai-enrichment";

export type ProcessNextResult = {
  done: boolean;       // no more work to do
  kind: "article" | "event" | "none";
  remaining: number;   // total items still in queue
};

/**
 * Processes ONE item from the enrichment queue:
 *   1. If there are aiPending articles → enrich the oldest one (creates RiskEvent)
 *   2. Else if there are unenriched NEEDS_REVIEW events → enrich the oldest one
 *   3. Otherwise → done
 *
 * Designed to be called in a client-side loop with a short delay between calls.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const LOOKBACK_DAYS = 7;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1_000);

  // 1. Pending articles take priority — they need to become events first
  const pendingCount = await prisma.rawArticle.count({
    where: { aiPending: true, createdAt: { gte: since } }
  });

  if (pendingCount > 0) {
    const result = await enrichPendingArticles(1); // process exactly one
    const remaining = await prisma.rawArticle.count({
      where: { aiPending: true, createdAt: { gte: since } }
    });
    if (result.skipped > 0 && result.processed === 0 && result.notRisk === 0) {
      return NextResponse.json({ done: true, kind: "article", remaining } satisfies ProcessNextResult);
    }
    return NextResponse.json({ done: remaining === 0, kind: "article", remaining } satisfies ProcessNextResult);
  }

  // 2. Unenriched NEEDS_REVIEW events (GeoRSS or manually promoted)
  const unenrichedEvent = await prisma.riskEvent.findFirst({
    where: { aiEnhanced: false, status: { in: ["NEEDS_REVIEW", "PUBLISHED"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  if (unenrichedEvent) {
    const result = await enrichEvent(unenrichedEvent.id);
    const remaining = await prisma.riskEvent.count({
      where: { aiEnhanced: false, status: { in: ["NEEDS_REVIEW", "PUBLISHED"] } }
    });
    if (!result.ok) {
      return NextResponse.json({ done: true, kind: "event", remaining } satisfies ProcessNextResult);
    }
    return NextResponse.json({ done: remaining === 0, kind: "event", remaining } satisfies ProcessNextResult);
  }

  return NextResponse.json({ done: true, kind: "none", remaining: 0 } satisfies ProcessNextResult);
}
