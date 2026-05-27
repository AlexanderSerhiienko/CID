import Parser from "rss-parser";
import { prisma } from "@/lib/db";
import { contentHash } from "@/lib/pipeline/hash";
import { extractEventFromArticle } from "@/lib/pipeline/extraction";
import { isDuplicateCandidate } from "@/lib/pipeline/deduplication";
import { scoreCandidate } from "@/lib/pipeline/scoring";
import { normalizeUrl, stripHtml } from "@/lib/utils";

const DUPLICATE_CONFIDENCE_INCREMENT = 0.1;

const parser = new Parser({
  timeout: 10_000,
  headers: {
    Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    "User-Agent": "CrisisIntelligenceDashboard/0.1 (+local-dev)"
  }
});

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function ingestRssSource(sourceId: string) {
  const source = await prisma.source.findUniqueOrThrow({
    where: { id: sourceId }
  });

  if (!source.enabled) {
    return { sourceId, createdArticles: 0, duplicateArticles: 0, candidateEvents: 0 };
  }

  const feed = await parser.parseURL(source.url);
  let createdArticles = 0;
  let duplicateArticles = 0;
  let candidateEvents = 0;

  for (const item of feed.items) {
    const itemUrl = item.link ? normalizeUrl(item.link) : null;
    const title = item.title?.trim();

    if (!itemUrl || !title) {
      continue;
    }

    const rawText = stripHtml(
      [item.content, item.contentSnippet, item.summary, item.title].filter(Boolean).join("\n")
    );
    const hash = contentHash(`${title}\n${rawText}`);
    const publishedAt = parseDate(item.isoDate ?? item.pubDate);

    const existingArticle = await prisma.rawArticle.findFirst({
      where: {
        OR: [{ url: itemUrl }, { contentHash: hash }]
      },
      select: { id: true }
    });

    if (existingArticle) {
      duplicateArticles += 1;
      continue;
    }

    const extracted = extractEventFromArticle({ title, rawText });

    const article = await prisma.rawArticle.create({
      data: {
        sourceId: source.id,
        title,
        url: itemUrl,
        publishedAt,
        contentHash: hash,
        rawText
      }
    });
    createdArticles += 1;

    if (!extracted.isLikelyRiskEvent) {
      continue;
    }

    const scored = scoreCandidate({
      category: extracted.category,
      severity: extracted.severity,
      confidence: extracted.confidence,
      locationConfidence: extracted.locationConfidence,
      source,
      rawText
    });

    const existingEvents = await prisma.riskEvent.findMany({
      where: {
        category: extracted.category,
        country: extracted.country ?? undefined
      },
      take: 25,
      orderBy: { createdAt: "desc" }
    });

    const duplicateEvent = existingEvents.find((event) =>
      isDuplicateCandidate({ ...extracted, publishedAt }, event)
    );

    if (duplicateEvent) {
      await prisma.rawArticle.update({
        where: { id: article.id },
        data: { riskEventId: duplicateEvent.id }
      });

      await prisma.riskEvent.update({
        where: { id: duplicateEvent.id },
        data: {
          confidence: Math.min(1, duplicateEvent.confidence + DUPLICATE_CONFIDENCE_INCREMENT)
        }
      });
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
        sourceUrl: itemUrl,
        rawArticles: {
          connect: { id: article.id }
        }
      }
    });
    candidateEvents += 1;
  }

  return { sourceId, createdArticles, duplicateArticles, candidateEvents };
}
