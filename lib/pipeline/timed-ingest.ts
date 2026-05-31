import { enqueueIngest } from "@/lib/pipeline/ingest-queue";
import { prisma } from "@/lib/db";

const TIME_LIMIT_MS = 50_000; // stop scheduling new sources after 50s, leave buffer for Vercel's 60s limit

export type TimedIngestResult = {
  processed: string[];   // sourceIds that were started
  remaining: string[];   // sourceIds not reached before time limit
  results: { sourceId: string; sourceName: string; ok: boolean; result?: unknown; error?: string }[];
};

export async function ingestSourcesWithTimeLimit(
  sourceIds: string[],
  initialDelayMs = 0
): Promise<TimedIngestResult> {
  if (initialDelayMs > 0) {
    await new Promise((r) => setTimeout(r, initialDelayMs));
  }

  const sources = await prisma.source.findMany({
    where: { id: { in: sourceIds }, enabled: true },
    select: { id: true, name: true }
  });

  const startedAt = Date.now();
  const processed: string[] = [];
  const results: TimedIngestResult["results"] = [];

  for (const source of sources) {
    if (Date.now() - startedAt > TIME_LIMIT_MS) {
      break;
    }

    processed.push(source.id);
    try {
      const result = await enqueueIngest(source.id);
      results.push({ sourceId: source.id, sourceName: source.name, ok: true, result });
    } catch (err) {
      results.push({
        sourceId: source.id,
        sourceName: source.name,
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error"
      });
    }
  }

  const processedSet = new Set(processed);
  const remaining = sourceIds.filter((id) => !processedSet.has(id));

  return { processed, remaining, results };
}

export function getContinueUrl(): string {
  const vercelUrl = process.env.VERCEL_URL;
  const base = vercelUrl
    ? `https://${vercelUrl}`
    : "http://localhost:3000";
  return `${base}/api/admin/ingest-continue`;
}
