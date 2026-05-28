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

  // Find all NEEDS_REVIEW events from OFFICIAL_FEED sources
  const events = await prisma.riskEvent.findMany({
    where: { status: EventStatus.NEEDS_REVIEW },
    select: {
      id: true,
      rawArticles: {
        select: {
          source: { select: { type: true } }
        },
        take: 1
      }
    }
  });

  const officialIds = events
    .filter((e) => e.rawArticles.some((a) => a.source.type === SourceType.OFFICIAL_FEED))
    .map((e) => e.id);

  if (officialIds.length === 0) {
    return NextResponse.json({ approved: 0 });
  }

  const result = await prisma.riskEvent.updateMany({
    where: { id: { in: officialIds } },
    data: { status: EventStatus.PUBLISHED }
  });

  return NextResponse.json({ approved: result.count });
}
