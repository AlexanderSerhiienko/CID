import { EventCategory, EventStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

async function main() {
  const result = await prisma.riskEvent.updateMany({
    where: {
      status: { in: [EventStatus.DRAFT, EventStatus.NEEDS_REVIEW] },
      confidence: { gte: 0.8 },
      locationConfidence: { gte: 0.6 },
      category: { not: EventCategory.UNKNOWN }
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
