import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";
import { ingestRssSource } from "@/lib/pipeline/rss";

const ingestSchema = z.object({
  sourceId: z.string().optional(),
  queue: z.boolean().default(false)
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
    ? await prisma.source.findMany({ where: { id: payload.data.sourceId, enabled: true } })
    : await prisma.source.findMany({ where: { enabled: true } });

  if (payload.data.queue) {
    const { ingestionQueue } = await import("@/lib/queue");
    const jobs = await Promise.all(
      sources.map((source) =>
        ingestionQueue.add("ingest-source", { sourceId: source.id }, { jobId: `source:${source.id}` })
      )
    );

    return NextResponse.json({
      queued: jobs.map((job) => ({ id: job.id, sourceId: job.data.sourceId }))
    });
  }

  // Run all sources in parallel — sequential processing risks Vercel's 60 s timeout
  // when multiple sources are present (10 sources × 10 s each = guaranteed timeout).
  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const result = await ingestRssSource(source.id);
      return { sourceId: source.id, sourceName: source.name, result };
    })
  );

  const results = sources.map((source, i) => {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      return { sourceId: source.id, sourceName: source.name, ok: true, result: outcome.value.result };
    }
    const reason = outcome.reason as unknown;
    return {
      sourceId: source.id,
      sourceName: source.name,
      ok: false,
      error: reason instanceof Error ? reason.message : "Unknown ingestion error"
    };
  });

  const status = results.some((result) => result.ok) || results.length === 0 ? 200 : 502;

  return NextResponse.json({ results }, { status });
}
