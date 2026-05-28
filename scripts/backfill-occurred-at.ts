/**
 * Backfill occurredAt for existing RiskEvents.
 *
 * Sets occurredAt = MIN(rawArticles.publishedAt) for each event
 * where occurredAt is currently null and at least one rawArticle has publishedAt set.
 */
import { prisma } from "@/lib/db";

async function main() {
  const events = await prisma.riskEvent.findMany({
    where: { occurredAt: null },
    select: {
      id: true,
      rawArticles: {
        where: { publishedAt: { not: null } },
        select: { publishedAt: true },
        orderBy: { publishedAt: "asc" },
        take: 1
      }
    }
  });

  let updated = 0;
  let skipped = 0;

  for (const event of events) {
    const earliest = event.rawArticles[0]?.publishedAt;
    if (!earliest) {
      skipped += 1;
      continue;
    }

    await prisma.riskEvent.update({
      where: { id: event.id },
      data: { occurredAt: earliest }
    });
    updated += 1;
  }

  console.log(`Backfilled occurredAt: ${updated} events updated, ${skipped} skipped (no publishedAt).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
