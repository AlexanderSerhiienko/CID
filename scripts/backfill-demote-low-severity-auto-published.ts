import { EventStatus, Severity } from "@prisma/client";
import { prisma } from "@/lib/db";

async function main() {
  const result = await prisma.riskEvent.updateMany({
    where: {
      status: EventStatus.PUBLISHED,
      severity: { in: [Severity.LOW, Severity.MEDIUM] },
      signals: {
        array_contains: [{ label: "status:auto_published" }]
      }
    },
    data: {
      status: EventStatus.NEEDS_REVIEW
    }
  });

  console.log(`Demoted ${result.count} low/medium auto-published events to review.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
