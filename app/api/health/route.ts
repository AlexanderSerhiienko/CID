import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import IORedis from "ioredis";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {
    checks.db = "error";
  }

  // Redis check
  try {
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    const isTls = redisUrl.startsWith("rediss://");
    const redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
      tls: isTls ? {} : undefined
    });
    await redis.connect();
    await redis.ping();
    await redis.quit();
    checks.redis = "ok";
  } catch {
    checks.redis = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    { status: allOk ? "ok" : "degraded", checks },
    { status: allOk ? 200 : 503 }
  );
}
