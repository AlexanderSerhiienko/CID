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

  // Multi-source ingestion always goes through BullMQ so sources are processed
  // sequentially. Each job's recentEvents snapshot sees events created by the
  // previous job — preventing cross-source duplicate RiskEvents for the same crisis.
  //
  // Single-source ingestion runs synchronously: no concurrency, no race, no timeout.
  const useQueue = payload.data.queue || sources.length > 1;

  if (useQueue) {
    try {
      const { ingestionQueue } = await import("@/lib/queue");
      const jobs = await Promise.all(
        sources.map((source) =>
          ingestionQueue.add("ingest-source", { sourceId: source.id }, { jobId: `source:${source.id}` })
        )
      );

      return NextResponse.json({
        queued: jobs.map((job) => ({ id: job.id, sourceId: job.data.sourceId }))
      });
    } catch {
      return NextResponse.json(
        { error: "Queue unavailable. Retry or use { sourceId } for single-source synchronous ingestion." },
        { status: 503 }
      );
    }
  }

  // Single source — synchronous path is safe (no concurrency, no Vercel timeout risk).
  const source = sources[0];

  if (!source) {
    return NextResponse.json({ results: [] }, { status: 200 });
  }

  try {
    const result = await ingestRssSource(source.id);
    return NextResponse.json({
      results: [{ sourceId: source.id, sourceName: source.name, ok: true, result }]
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown ingestion error";
    return NextResponse.json(
      { results: [{ sourceId: source.id, sourceName: source.name, ok: false, error }] },
      { status: 502 }
    );
  }
}
