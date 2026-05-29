import { prisma } from "@/lib/db";
import { isDuplicateCandidate } from "@/lib/pipeline/deduplication";
import { extractEventFromArticle } from "@/lib/pipeline/extraction";
import { scoreCandidate } from "@/lib/pipeline/scoring";

async function main() {
  const articles = await prisma.rawArticle.findMany({
    where: { riskEventId: null },
    include: { source: true },
    orderBy: { createdAt: "asc" }
  });

  let linkedDuplicates = 0;
  let createdEvents = 0;
  let ignored = 0;

  for (const article of articles) {
    const extracted = extractEventFromArticle({
      title: article.title,
      rawText: article.rawText
    });

    if (!extracted.isLikelyRiskEvent) {
      ignored += 1;
      continue;
    }

    const scored = scoreCandidate({
      category: extracted.category,
      severity: extracted.severity,
      confidence: extracted.confidence,
      locationConfidence: extracted.locationConfidence,
      source: article.source,
      rawText: article.rawText
    });

    // Mirror the main pipeline's 5-day dedup window (rss.ts) instead of a hard
    // take:25 cap that silently misses duplicates in high-volume category+country
    // combinations, creating phantom duplicate events.
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1_000);
    const existingEvents = await prisma.riskEvent.findMany({
      where: {
        category: extracted.category,
        country: extracted.country ?? undefined,
        createdAt: { gte: fiveDaysAgo }
      },
      orderBy: { createdAt: "desc" }
    });

    const duplicateEvent = existingEvents.find((event) =>
      isDuplicateCandidate({ ...extracted, publishedAt: article.publishedAt }, event)
    );

    if (duplicateEvent) {
      await prisma.rawArticle.update({
        where: { id: article.id },
        data: { riskEventId: duplicateEvent.id }
      });
      linkedDuplicates += 1;
      continue;
    }

    await prisma.riskEvent.create({
      data: {
        title: extracted.title,
        summary: extracted.summary,
        category: extracted.category,
        country: extracted.country,
        city: extracted.city,
        latitude: extracted.latitude,
        longitude: extracted.longitude,
        locationConfidence: extracted.locationConfidence,
        severity: scored.severity,
        confidence: scored.confidence,
        status: scored.status,
        signals: [...extracted.signals, ...scored.signals],
        sourceUrl: article.url,
        rawArticles: {
          connect: { id: article.id }
        }
      }
    });
    createdEvents += 1;
  }

  console.log(
    `Backfilled ${createdEvents} events from raw articles. Linked ${linkedDuplicates} duplicates. Ignored ${ignored} non-risk articles.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
