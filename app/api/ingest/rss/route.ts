import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";
import { enqueueIngest } from "@/lib/pipeline/ingest-queue";

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
    ? await prisma.source.findMany({ where: { id: payload.data.sourceId, enabled: true } })
    : await prisma.source.findMany({ where: { enabled: true } });

  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        const result = await enqueueIngest(source.id);
        return { sourceId: source.id, sourceName: source.name, ok: true, result };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown ingestion error";
        return { sourceId: source.id, sourceName: source.name, ok: false, error };
      }
    })
  );

  return NextResponse.json({ results });
}
