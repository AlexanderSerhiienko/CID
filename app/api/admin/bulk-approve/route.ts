/**
 * POST /api/admin/bulk-approve
 *
 * Publishes all NEEDS_REVIEW events from OFFICIAL_FEED sources in one operation.
 * Admin-only. Returns { approved: number }.
 */
import { EventStatus, SourceType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  // Publish all NEEDS_REVIEW events that have at least one article from an OFFICIAL_FEED source
  const result = await prisma.riskEvent.updateMany({
    where: {
      status: EventStatus.NEEDS_REVIEW,
      rawArticles: {
        some: { source: { type: SourceType.OFFICIAL_FEED } }
      }
    },
    data: { status: EventStatus.PUBLISHED }
  });

  return NextResponse.json({ approved: result.count });
}
