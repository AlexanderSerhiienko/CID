import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestSourcesWithTimeLimit, getContinueUrl } from "@/lib/pipeline/timed-ingest";
import { authorizeCron } from "@/lib/auth/cron";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = authorizeCron(request);
  if (!cronSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sources = await prisma.source.findMany({
    where: { enabled: true },
    select: { id: true }
  });
  const sourceIds = sources.map((s) => s.id);

  const { processed, remaining, results } = await ingestSourcesWithTimeLimit(sourceIds);

  if (remaining.length > 0) {
    fetch(getContinueUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`
      },
      body: JSON.stringify({ sourceIds: remaining })
    }).catch((e: unknown) => {
      console.error("cron: continuation fetch failed — skipped sources will retry on next run", e);
    });
  }

  return NextResponse.json({ processed, remaining, results, runAt: new Date().toISOString() });
}
