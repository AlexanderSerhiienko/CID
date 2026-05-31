import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { enrichPendingArticles, enrichEvent } from "@/lib/pipeline/ai-enrichment";

const schema = z.object({
  articleId: z.string().optional(),
  eventId: z.string().optional()
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const body = schema.safeParse(await request.json().catch(() => ({})));
  const { articleId, eventId } = body.success ? body.data : {};

  if (eventId) {
    const result = await enrichEvent(eventId);
    return NextResponse.json(result);
  }

  const result = await enrichPendingArticles(20, articleId);
  return NextResponse.json(result);
}
