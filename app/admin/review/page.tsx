import Link from "next/link";
import { EventStatus, Prisma } from "@prisma/client";
import { EmptyState } from "@/components/empty-state";
import { ReviewActions } from "@/components/review-actions";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { rankMergeSuggestions } from "@/lib/review/merge-suggestions";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const [events, mergeTargets] = await Promise.all([
    prisma.riskEvent.findMany({
      where: { status: EventStatus.NEEDS_REVIEW },
      orderBy: { createdAt: "asc" },
      include: {
        rawArticles: {
          include: { source: true }
        }
      }
    }),
    prisma.riskEvent.findMany({
      where: { status: { not: EventStatus.REJECTED } },
      orderBy: { updatedAt: "desc" },
      take: 50,
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
      <div>
        <h1 className="text-2xl font-semibold">Review Queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uncertain extracted events wait here before publication.
        </p>
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="Review queue is empty"
          detail="Run ingestion or lower confidence in extraction rules to generate review candidates."
        />
      ) : (
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
                  </div>
                  <Link href={`/events/${event.id}`} className="text-lg font-semibold">
                    {event.title}
                  </Link>
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
