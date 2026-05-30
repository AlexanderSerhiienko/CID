import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingestSourcesWithTimeLimit, getContinueUrl } from "@/lib/pipeline/timed-ingest";

const GROQ_MIN_INTERVAL_MS = 2_100;

const schema = z.object({
  sourceIds: z.array(z.string()).min(1)
});

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = schema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  // Delay before first Groq call — the previous container's rate limiter state is
  // gone, so without this the first article would fire immediately after the last
  // call of the previous batch, potentially within less than 2.1s.
  const { processed, remaining, results } = await ingestSourcesWithTimeLimit(
    payload.data.sourceIds,
    GROQ_MIN_INTERVAL_MS
  );

  if (remaining.length > 0) {
    const cronSecret = process.env.CRON_SECRET!;
    fetch(getContinueUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`
      },
      body: JSON.stringify({ sourceIds: remaining })
    }).catch(() => {});
  }

  return NextResponse.json({ processed, remaining, results });
}
