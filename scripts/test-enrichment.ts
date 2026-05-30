import { PrismaClient } from "@prisma/client";
import { ingestRssSource } from "../lib/pipeline/rss";

const prisma = new PrismaClient();

async function main() {
  const sources = await prisma.source.findMany({
    where: { enabled: true },
    select: { id: true, name: true }
  });

  console.log("Sources found:", sources.map((s) => s.name).join(", "));

  for (const source of sources) {
    console.log(`\n--- Ingesting: ${source.name} ---`);
    try {
      const result = await ingestRssSource(source.id);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error("Error:", e);
    }
  }

  // Show events with AI-enriched locations
  const enriched = await prisma.riskEvent.findMany({
    where: {
      signals: { path: "$[*].label", array_contains: "location:ai-enriched" },
    },
    select: { title: true, city: true, country: true, latitude: true, longitude: true, locationConfidence: true },
    take: 20,
  });

  console.log(`\n=== AI-enriched locations (${enriched.length}) ===`);
  for (const e of enriched) {
    console.log(`  [${e.country}] ${e.city} → ${e.latitude?.toFixed(3)}, ${e.longitude?.toFixed(3)} | "${e.title.slice(0, 60)}"`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
