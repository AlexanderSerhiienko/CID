import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestSourcesWithTimeLimit, getContinueUrl } from "@/lib/pipeline/timed-ingest";

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

  const sources = await prisma.source.findMany({
    where: { enabled: true },
    select: { id: true }
  });
  const sourceIds = sources.map((s) => s.id);

  const { processed, remaining, results } = await ingestSourcesWithTimeLimit(sourceIds);

  if (remaining.length > 0) {
    const cronSecret = process.env.CRON_SECRET!;
    fetch(getContinueUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`
      },
      body: JSON.stringify({ sourceIds: remaining })
    }).catch(() => {
      // fire-and-forget — failure is non-fatal, next cron run will catch skipped sources
    });
  }

  return NextResponse.json({ processed, remaining, results, runAt: new Date().toISOString() });
}
