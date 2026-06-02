import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";
import { createSourceSchema } from "@/lib/validation/source";

export async function GET(request: NextRequest) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) {
    return unauthorized;
  }

  const sources = await prisma.source.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      url: true,
      type: true,
      enabled: true,
      trustScore: true,
      lastIngestedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { rawArticles: true } }
    }
  });

  return NextResponse.json({ sources });
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = createSourceSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const source = await prisma.source.create({
    data: payload.data
  });

  return NextResponse.json({ source }, { status: 201 });
}
