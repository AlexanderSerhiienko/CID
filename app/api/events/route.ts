import { EventCategory, EventStatus, Prisma, Severity } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Public API: only PUBLISHED events are accessible without auth.
// Whitelist prevents callers from leaking DRAFT or NEEDS_REVIEW events
// by passing ?status=DRAFT in the query string.
const ALLOWED_PUBLIC_STATUSES: EventStatus[] = [EventStatus.PUBLISHED];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const category = searchParams.get("category");
  const severity = searchParams.get("severity");
  const country = searchParams.get("country");

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10)));
  const skip = (page - 1) * limit;

  const parsedCategory =
    category && Object.values(EventCategory).includes(category as EventCategory)
      ? (category as EventCategory)
      : undefined;
  const parsedSeverity =
    severity && Object.values(Severity).includes(severity as Severity)
      ? (severity as Severity)
      : undefined;

  // Validate status against whitelist — default to PUBLISHED, reject anything else.
  const statusParam = searchParams.get("status");
  const parsedStatus: EventStatus =
    statusParam && ALLOWED_PUBLIC_STATUSES.includes(statusParam as EventStatus)
      ? (statusParam as EventStatus)
      : EventStatus.PUBLISHED;

  const where: Prisma.RiskEventWhereInput = {
    status: parsedStatus,
    category: parsedCategory,
    severity: parsedSeverity,
    country: country || undefined,
    OR: query
      ? [
          { title: { contains: query, mode: "insensitive" } },
          { summary: { contains: query, mode: "insensitive" } },
          { country: { contains: query, mode: "insensitive" } },
          { city: { contains: query, mode: "insensitive" } }
        ]
      : undefined
  };

  const [events, total] = await Promise.all([
    prisma.riskEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      // rawArticles intentionally excluded from list endpoint — use GET /api/events/[id]
      // for full evidence. Including them here causes N×M DB joins on every list page.
      select: {
        id: true,
        title: true,
        summary: true,
        category: true,
        country: true,
        city: true,
        latitude: true,
        longitude: true,
        locationConfidence: true,
        severity: true,
        confidence: true,
        status: true,
        occurredAt: true,
        createdAt: true,
        updatedAt: true,
        sourceUrl: true,
        signals: true,
        _count: { select: { rawArticles: true } }
      }
    }),
    prisma.riskEvent.count({ where })
  ]);

  return NextResponse.json({
    events,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
}
