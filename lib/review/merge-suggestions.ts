import { EventCategory, EventStatus } from "@prisma/client";
import { jaccardSimilarity } from "@/lib/pipeline/similarity";

export type MergeSuggestionEvent = {
  id: string;
  title: string;
  summary: string;
  category: EventCategory;
  status: EventStatus;
  country: string | null;
  city: string | null;
  updatedAt: Date;
};

export type MergeSuggestion = MergeSuggestionEvent & {
  score: number;
  reasons: string[];
};

export function scoreMergeTarget(source: MergeSuggestionEvent, target: MergeSuggestionEvent) {
  if (source.id === target.id || target.status === EventStatus.REJECTED) {
    return null;
  }

  let score = 0;
  const reasons: string[] = [];

  if (source.category === target.category) {
    score += 0.35;
    reasons.push("same category");
  }

  if (source.country && target.country && source.country === target.country) {
    score += 0.25;
    reasons.push("same country");
  }

  if (source.city && target.city && source.city === target.city) {
    score += 0.15;
    reasons.push("same city");
  }

  const titleSimilarity = jaccardSimilarity(source.title, target.title);
  const summarySimilarity = jaccardSimilarity(source.summary, target.summary);
  const similarity = Math.max(titleSimilarity, summarySimilarity);

  if (similarity >= 0.4) {
    score += 0.25;
    reasons.push("similar text");
  } else if (similarity >= 0.2) {
    score += 0.12;
    reasons.push("partly similar text");
  }

  const daysSinceUpdate = Math.abs(Date.now() - target.updatedAt.getTime()) / 86_400_000;
  if (daysSinceUpdate <= 7) {
    score += 0.08;
    reasons.push("recent event");
  }

  if (target.status === EventStatus.PUBLISHED) {
    score += 0.07;
    reasons.push("published target");
  }

  return {
    ...target,
    score: Number(Math.min(1, score).toFixed(2)),
    reasons: reasons.length > 0 ? reasons : ["manual candidate"]
  };
}

export function rankMergeSuggestions(
  source: MergeSuggestionEvent,
  targets: MergeSuggestionEvent[]
) {
  return targets
    .map((target) => scoreMergeTarget(source, target))
    .filter((target): target is MergeSuggestion => Boolean(target))
    .sort((a, b) => b.score - a.score || b.updatedAt.getTime() - a.updatedAt.getTime());
}

