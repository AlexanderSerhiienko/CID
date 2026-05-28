/**
 * Promote NEEDS_REVIEW events from OFFICIAL_FEED sources to PUBLISHED.
 *
 * Matches the new scoring rule: OFFICIAL_FEED sources at MEDIUM+ severity
 * auto-publish without requiring location confidence.
 *
 * Run after deploying the updated scoring threshold to clear the existing backlog.
 */
import { EventCategory, EventStatus, Severity, SourceType } from "@prisma/client";
import { prisma } from "@/lib/db";

const OFFICIAL_CONFIDENCE_THRESHOLD = 0.6;
const PROMOTABLE_SEVERITIES: Severity[] = [Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL];

async function main() {
  // Find NEEDS_REVIEW events linked to at least one OFFICIAL_FEED source
  const candidates = await prisma.riskEvent.findMany({
    where: {
      status: EventStatus.NEEDS_REVIEW,
      category: { not: EventCategory.UNKNOWN },
      severity: { in: PROMOTABLE_SEVERITIES },
      confidence: { gte: OFFICIAL_CONFIDENCE_THRESHOLD },
      rawArticles: {
        some: { source: { type: SourceType.OFFICIAL_FEED } }
      }
    },
    select: { id: true }
  });

  if (candidates.length === 0) {
    console.log("No OFFICIAL_FEED events eligible for promotion.");
    return;
  }

  const result = await prisma.riskEvent.updateMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    data: { status: EventStatus.PUBLISHED }
  });

  console.log(`Promoted ${result.count} OFFICIAL_FEED events from NEEDS_REVIEW to PUBLISHED.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
