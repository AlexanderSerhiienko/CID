import { EventCategory, EventStatus, Prisma, Severity } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const query = searchParams.get("q");
  const category = searchParams.get("category");
  const severity = searchParams.get("severity");
  const country = searchParams.get("country");

  const parsedCategory = category && Object.values(EventCategory).includes(category as EventCategory)
    ? (category as EventCategory)
    : undefined;
  const parsedSeverity = severity && Object.values(Severity).includes(severity as Severity)
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

  const events = await prisma.riskEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
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
  });

  return NextResponse.json({ events });
}
