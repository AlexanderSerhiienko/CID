import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";
import { ingestSourcesWithTimeLimit, getContinueUrl } from "@/lib/pipeline/timed-ingest";

const ingestSchema = z.object({
  sourceId: z.string().optional()
});

export async function POST(request: NextRequest) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = ingestSchema.safeParse(await request.json().catch(() => ({})));

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const sources = payload.data.sourceId
    ? await prisma.source.findMany({ where: { id: payload.data.sourceId, enabled: true }, select: { id: true } })
    : await prisma.source.findMany({ where: { enabled: true }, select: { id: true } });

  const sourceIds = sources.map((s) => s.id);

  const { processed, remaining, results } = await ingestSourcesWithTimeLimit(sourceIds);

  // If there are remaining sources that didn't fit within the time limit,
  // fire a continuation request (same pattern as the cron endpoint).
  if (remaining.length > 0) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      fetch(getContinueUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cronSecret}`
        },
        body: JSON.stringify({ sourceIds: remaining })
      }).catch((e: unknown) => {
        console.error("ingest/rss: continuation fetch failed — remaining sources will not be processed", e);
      });
    } else {
      console.warn("ingest/rss: CRON_SECRET not set — cannot schedule continuation for remaining sources", remaining);
    }
  }

  return NextResponse.json({ processed, remaining, results });
}
