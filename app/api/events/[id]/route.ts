import { EventStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const event = await prisma.riskEvent.findUnique({
    where: { id, status: EventStatus.PUBLISHED },
    include: {
      rawArticles: {
        include: {
          source: true
        }
      }
    }
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ event });
}

