/**
 * POST /api/admin/bulk-approve
 *
 * Publishes all NEEDS_REVIEW events that were AI-enriched (Groq confirmed risk).
 * Admin-only. Returns { approved: number }.
 */
import { EventStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  // Publish all NEEDS_REVIEW events that Groq has confirmed as risk events
  const result = await prisma.riskEvent.updateMany({
    where: {
      status: EventStatus.NEEDS_REVIEW,
      aiEnhanced: true
    },
    data: { status: EventStatus.PUBLISHED }
  });

  return NextResponse.json({ approved: result.count });
}
