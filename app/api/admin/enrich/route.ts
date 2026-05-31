import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { enrichEventsWithGroq } from "@/lib/pipeline/enrich";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const result = await enrichEventsWithGroq();
  return NextResponse.json(result);
}
