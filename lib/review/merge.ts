import { EventStatus, PrismaClient } from "@prisma/client";

type ReviewMergeClient = Pick<PrismaClient, "$transaction">;

export function mergeConfidence(targetConfidence: number, movedEvidenceCount: number) {
  return Math.min(1, Number((targetConfidence + movedEvidenceCount * 0.05).toFixed(2)));
}

export async function mergeRiskEvent({
  prisma,
  sourceEventId,
  targetEventId
}: {
  prisma: ReviewMergeClient;
  sourceEventId: string;
  targetEventId: string;
}) {
  if (sourceEventId === targetEventId) {
    throw new Error("Cannot merge an event into itself.");
  }

  return prisma.$transaction(async (tx) => {
    const [sourceEvent, targetEvent] = await Promise.all([
      tx.riskEvent.findUnique({
        where: { id: sourceEventId },
        include: { rawArticles: { select: { id: true } } }
      }),
      tx.riskEvent.findUnique({
        where: { id: targetEventId },
        include: { rawArticles: { select: { id: true } } }
      })
    ]);

    if (!sourceEvent) {
      throw new Error("Source event not found.");
    }

    if (!targetEvent) {
      throw new Error("Target event not found.");
    }

    if (sourceEvent.status !== EventStatus.NEEDS_REVIEW) {
      throw new Error(
        `Cannot merge event with status ${sourceEvent.status}. Only NEEDS_REVIEW events can be merged.`
      );
    }

    const movedArticleIds = sourceEvent.rawArticles.map((article) => article.id);

    if (movedArticleIds.length > 0) {
      await tx.rawArticle.updateMany({
        where: { id: { in: movedArticleIds } },
        data: { riskEventId: targetEvent.id }
      });
    }

    const updatedTarget = await tx.riskEvent.update({
      where: { id: targetEvent.id },
      data: {
        confidence: mergeConfidence(targetEvent.confidence, movedArticleIds.length)
      }
    });

    const rejectedSource = await tx.riskEvent.update({
      where: { id: sourceEvent.id },
      data: {
        status: EventStatus.REJECTED
      }
    });

    return {
      targetEvent: updatedTarget,
      sourceEvent: rejectedSource,
      movedEvidenceCount: movedArticleIds.length
    };
  });
}

