import { EventCategory, EventStatus, Severity } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";
import { mergeRiskEvent } from "@/lib/review/merge";

const reviewSchema = z.object({
  id: z.string(),
  action: z.enum(["approve", "reject", "merge"]),
  targetEventId: z.string().optional(),
  patch: z
    .object({
      title: z.string().min(3).optional(),
      summary: z.string().min(3).optional(),
      category: z.nativeEnum(EventCategory).optional(),
      severity: z.nativeEnum(Severity).optional(),
      country: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
      locationConfidence: z.number().min(0).max(1).optional()
    })
    .optional()
});

export async function GET() {
  const events = await prisma.riskEvent.findMany({
    where: { status: EventStatus.NEEDS_REVIEW },
    orderBy: { createdAt: "asc" },
    include: {
      rawArticles: {
        select: {
          id: true,
          title: true,
          url: true,
          source: { select: { name: true } }
        }
      }
    }
  });

  return NextResponse.json({ events });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = reviewSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  if (payload.data.action === "merge") {
    if (!payload.data.targetEventId) {
      return NextResponse.json({ error: "targetEventId is required for merge." }, { status: 400 });
    }

    try {
      const result = await mergeRiskEvent({
        prisma,
        sourceEventId: payload.data.id,
        targetEventId: payload.data.targetEventId
      });

      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Merge failed." },
        { status: 400 }
      );
    }
  }

  const event = await prisma.riskEvent.update({
    where: { id: payload.data.id },
    data: {
      ...payload.data.patch,
      status:
        payload.data.action === "approve"
          ? EventStatus.PUBLISHED
          : EventStatus.REJECTED
    }
  });

  return NextResponse.json({ event });
}
