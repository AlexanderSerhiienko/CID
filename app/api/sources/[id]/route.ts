import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";
import { updateSourceSchema } from "@/lib/validation/source";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await context.params;
  const payload = updateSourceSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const result = await prisma.source.updateMany({
    where: { id },
    data: payload.data
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 });
  }

  // Re-fetch to return the updated record (updateMany doesn't return the row)
  const source = await prisma.source.findUnique({ where: { id } });
  return NextResponse.json({ source });
}
