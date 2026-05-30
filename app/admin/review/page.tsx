import Link from "next/link";
import { EventStatus, Prisma, SourceType } from "@prisma/client";
import { EmptyState } from "@/components/empty-state";
import { ReviewActions } from "@/components/review-actions";
import { BulkApproveButton } from "@/components/bulk-approve-button";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { rankMergeSuggestions } from "@/lib/review/merge-suggestions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function ReviewPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawPage = parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const page = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage);
  const skip = (page - 1) * PAGE_SIZE;

  const [events, total, officialCount, mergeTargets] = await Promise.all([
    prisma.riskEvent.findMany({
      where: { status: EventStatus.NEEDS_REVIEW },
      orderBy: { createdAt: "asc" },
      skip,
      take: PAGE_SIZE,
      include: {
        rawArticles: {
          include: { source: true }
        }
      }
    }),
    prisma.riskEvent.count({ where: { status: EventStatus.NEEDS_REVIEW } }),
    // Count NEEDS_REVIEW events that came from at least one OFFICIAL_FEED source
    prisma.riskEvent.count({
      where: {
        status: EventStatus.NEEDS_REVIEW,
        rawArticles: {
          some: { source: { type: SourceType.OFFICIAL_FEED } }
        }
      }
    }),
    // Merge suggestions are only meaningful for recent events. Use a 7-day window
    // instead of a hard take:50 — the cap silently omits older events even when
    // they are the best semantic match for a candidate being reviewed.
    prisma.riskEvent.findMany({
      where: {
        status: { not: EventStatus.REJECTED },
        updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000) }
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        summary: true,
        category: true,
        status: true,
        country: true,
        city: true,
        updatedAt: true
      }
    })
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Review Queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Uncertain extracted events wait here before publication.
            {total > 0 && (
              <> {total} event{total !== 1 ? "s" : ""} awaiting review.</>
            )}
          </p>
        </div>
        {officialCount > 0 && (
          <BulkApproveButton pendingCount={officialCount} />
        )}
      </div>

      {events.length === 0 && page === 1 ? (
        <EmptyState
          title="Review queue is empty"
          detail="Run ingestion or lower confidence in extraction rules to generate review candidates."
        />
      ) : (
        <>
          <div className="space-y-4">
            {events.map((event) => {
              const mergeSuggestions = rankMergeSuggestions(event, mergeTargets).slice(0, 12);

              return (
              <article key={event.id} className="rounded-md border border-border bg-card p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <Badge tone="blue">{event.category}</Badge>
                      <Badge tone="yellow">{event.severity}</Badge>
                      <Badge>{Math.round(event.confidence * 100)}% confidence</Badge>
                      {event.aiEnhanced && <Badge tone="green">AI</Badge>}
                      {event.geocoderUsed && <Badge tone="green">Geocoded</Badge>}
                      {event.extractionSource === "georss" && <Badge>GeoRSS</Badge>}
                    </div>
                    <p className="text-lg font-semibold">{event.title}</p>
                    <p className="mt-2 max-w-4xl text-sm text-muted-foreground">{event.summary}</p>
                    <div className="mt-3 text-sm">
                      Location: {[event.city, event.country].filter(Boolean).join(", ") || "Unknown"} ·
                      location confidence {Math.round(event.locationConfidence * 100)}%
                    </div>
                  </div>
                  <ReviewActions event={event} mergeTargets={mergeSuggestions} />
                </div>

                <div className="mt-4 border-t border-border pt-3 text-sm">
                  <div className="font-medium">Evidence</div>
                  <div className="mt-2 space-y-2">
                    {event.rawArticles.map((article) => (
                      <div key={article.id} className="rounded-md border border-border bg-background p-3">
                        <a className="text-primary" href={article.url} target="_blank">
                          {article.title}
                        </a>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {article.source.name}
                          {article.publishedAt ? ` · ${article.publishedAt.toISOString().slice(0, 10)}` : ""}
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {article.rawText}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 border-t border-border pt-3 text-sm">
                  <div className="font-medium">Extraction signals</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {readSignals(event.signals).length > 0 ? (
                      readSignals(event.signals).map((signal, index) => (
                        <span
                          key={`${signal.label}-${index}`}
                          title={signal.detail}
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                        >
                          {signal.label}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No extraction signals recorded.</span>
                    )}
                  </div>
                </div>
              </article>
              );
            })}
          </div>

          {Math.ceil(total / PAGE_SIZE) > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Page {page} of {Math.ceil(total / PAGE_SIZE)}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={`/admin/review${page > 2 ? `?page=${page - 1}` : ""}`}
                    className="rounded-md border border-border bg-card px-3 py-1.5 hover:bg-muted"
                  >
                    ← Prev
                  </Link>
                ) : (
                  <span className="rounded-md border border-border px-3 py-1.5 text-muted-foreground opacity-40">
                    ← Prev
                  </span>
                )}
                {page < Math.ceil(total / PAGE_SIZE) ? (
                  <Link
                    href={`/admin/review?page=${page + 1}`}
                    className="rounded-md border border-border bg-card px-3 py-1.5 hover:bg-muted"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="rounded-md border border-border px-3 py-1.5 text-muted-foreground opacity-40">
                    Next →
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type ReviewSignal = {
  label: string;
  detail?: string;
};

function readSignals(value: Prisma.JsonValue): ReviewSignal[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const signals: ReviewSignal[] = [];

  for (const signal of value) {
    if (!signal || typeof signal !== "object" || Array.isArray(signal)) {
      continue;
    }

    const record = signal as Record<string, unknown>;
    if (typeof record.label !== "string") {
      continue;
    }

    signals.push({
      label: record.label,
      detail: typeof record.detail === "string" ? record.detail : undefined
    });
  }

  return signals;
}
