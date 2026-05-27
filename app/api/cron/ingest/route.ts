import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestRssSource } from "@/lib/pipeline/rss";

// Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sources = await prisma.source.findMany({ where: { enabled: true } });

  const results = [];

  for (const source of sources) {
    try {
      const result = await ingestRssSource(source.id);
      results.push({ sourceId: source.id, sourceName: source.name, ok: true, result });
    } catch (error) {
      results.push({
        sourceId: source.id,
        sourceName: source.name,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  return NextResponse.json({ results, runAt: new Date().toISOString() });
}
