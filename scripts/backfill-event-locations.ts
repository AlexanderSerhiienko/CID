import { prisma } from "@/lib/db";
import { extractEventFromArticle, type PipelineSignal } from "@/lib/pipeline/extraction";

async function main() {
  const events = await prisma.riskEvent.findMany({
    include: {
      rawArticles: {
        select: {
          rawText: true,
          title: true
        }
      }
    }
  });

  let updated = 0;
  let unchanged = 0;

  for (const event of events) {
    const titleLocation = extractEventFromArticle({ title: event.title, rawText: "" });
    const rawText = [
      event.summary,
      ...event.rawArticles.flatMap((article) => [article.title, article.rawText])
    ].join("\n");
    const extracted = extractEventFromArticle({ title: event.title, rawText });
    const preferred = titleLocation.country ? titleLocation : extracted;

    if (!preferred.country) {
      unchanged += 1;
      continue;
    }

    const shouldUpdate =
      !event.country ||
      event.locationConfidence === 0 ||
      preferred.country !== event.country ||
      preferred.locationConfidence > event.locationConfidence;

    if (!shouldUpdate) {
      unchanged += 1;
      continue;
    }

    // Preserve non-location signals (scoring, AI, keywords) from the existing event.
    // Only replace location signals so scoring/AI signals are not destroyed.
    const existingSignals = (event.signals as PipelineSignal[]) ?? [];
    const nonLocationSignals = existingSignals.filter((s) => s.kind !== "location");
    const newLocationSignals = preferred.signals.filter((s) => s.kind === "location");
    const mergedSignals = [...nonLocationSignals, ...newLocationSignals];

    await prisma.riskEvent.update({
      where: { id: event.id },
      data: {
        country: preferred.country,
        city: preferred.city,
        latitude: preferred.latitude,
        longitude: preferred.longitude,
        locationConfidence: preferred.locationConfidence,
        signals: mergedSignals
      }
    });
    updated += 1;
  }

  console.log(`Backfilled ${updated} event locations. ${unchanged} unchanged.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
