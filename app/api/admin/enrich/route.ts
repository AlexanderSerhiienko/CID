import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { enrichPendingArticles } from "@/lib/pipeline/ai-enrichment";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const result = await enrichPendingArticles();
  return NextResponse.json(result);
}
