import { EventCategory, RiskEvent } from "@prisma/client";
import { jaccardSimilarity } from "@/lib/pipeline/similarity";

const DATE_WINDOW_DAYS = 5;
// Raised from 0.2 → 0.3 to reduce false merges between different events in the same country.
// 0.2 was too permissive: "earthquake Japan" vs "flood Japan" share ~0.33 tokens (1 of 3)
// and could be incorrectly merged. 0.3 requires more meaningful token overlap.
// Real-world different-event pairs (e.g. 8-word titles sharing only country) land around 0.1.
const SIMILARITY_THRESHOLD = 0.3;

export function isDuplicateCandidate(
  candidate: {
    title: string;
    summary: string;
    category: EventCategory;
    country: string | null;
    city: string | null;
    publishedAt: Date | null;
  },
  existing: Pick<RiskEvent, "title" | "summary" | "category" | "country" | "city" | "createdAt">
) {
  if (candidate.category === EventCategory.UNKNOWN || existing.category === EventCategory.UNKNOWN) {
    return false;
  }

  if (candidate.category !== existing.category) {
    return false;
  }

  if (!candidate.country || !existing.country) {
    return false;
  }

  if (candidate.country && existing.country && candidate.country !== existing.country) {
    return false;
  }

  if (candidate.city && existing.city && candidate.city !== existing.city) {
    return false;
  }

  const eventDate = candidate.publishedAt ?? new Date();
  const daysApart = Math.abs(eventDate.getTime() - existing.createdAt.getTime()) / 86_400_000;
  if (daysApart > DATE_WINDOW_DAYS) {
    return false;
  }

  const titleSimilarity = jaccardSimilarity(candidate.title, existing.title);
  const summarySimilarity = jaccardSimilarity(candidate.summary, existing.summary);

  return Math.max(titleSimilarity, summarySimilarity) >= SIMILARITY_THRESHOLD;
}
