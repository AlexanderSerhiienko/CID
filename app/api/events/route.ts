import { EventCategory, EventStatus, Prisma, Severity } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
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

  const where: Prisma.RiskEventWhereInput = {
    status: status ? (status as EventStatus) : EventStatus.PUBLISHED,
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
      include: {
        rawArticles: {
          select: {
            id: true,
            title: true,
            url: true,
            source: { select: { name: true, trustScore: true } }
          }
        }
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
