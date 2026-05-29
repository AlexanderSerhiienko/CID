import { EventCategory, EventStatus, Severity } from "@prisma/client";
import { prisma } from "@/lib/db";

async function main() {
  // Mirrors canAutoPublishStandard in lib/pipeline/scoring.ts:
  // confidence >= 0.8, locationConfidence >= 0.6, known category, HIGH or CRITICAL severity.
  const result = await prisma.riskEvent.updateMany({
    where: {
      status: { in: [EventStatus.DRAFT, EventStatus.NEEDS_REVIEW] },
      confidence: { gte: 0.8 },
      locationConfidence: { gte: 0.6 },
      category: { not: EventCategory.UNKNOWN },
      severity: { in: [Severity.HIGH, Severity.CRITICAL] }
    },
    data: {
      status: EventStatus.PUBLISHED
    }
  });

  console.log(`Auto-published ${result.count} high-confidence located events.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
