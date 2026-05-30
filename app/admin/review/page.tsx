import Link from "next/link";
import { EventStatus, Prisma, Severity, SourceType } from "@prisma/client";
import { EmptyState } from "@/components/empty-state";
import { ReviewActions } from "@/components/review-actions";
import { BulkApproveButton } from "@/components/bulk-approve-button";
import { AdminGate } from "@/components/admin-gate";
import { prisma } from "@/lib/db";
import { rankMergeSuggestions } from "@/lib/review/merge-suggestions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function severityColor(severity: Severity): string {
  if (severity === Severity.CRITICAL) return "#ffb4ab";
  if (severity === Severity.HIGH) return "#ffb786";
  if (severity === Severity.MEDIUM) return "#4edea3";
  return "#8c909f";
}

function severityBg(severity: Severity): string {
  if (severity === Severity.CRITICAL) return "#ffb4ab1a";
  if (severity === Severity.HIGH) return "#ffb7861a";
  if (severity === Severity.MEDIUM) return "#4edea31a";
  return "#8c909f1a";
}

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
    prisma.riskEvent.count({
      where: {
        status: EventStatus.NEEDS_REVIEW,
        rawArticles: {
          some: { source: { type: SourceType.OFFICIAL_FEED } }
        }
      }
    }),
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

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminGate>
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#e1e2ec] tracking-tight">Review Queue</h1>
          <p className="mt-1 text-sm text-[#c2c6d6]">
            Manage and triage incoming crisis events.{" "}
            {total > 0 && (
              <span className="text-[#ffb786]">{total} event{total !== 1 ? "s" : ""} awaiting review.</span>
            )}
          </p>
        </div>
        {officialCount > 0 && <BulkApproveButton pendingCount={officialCount} />}
      </div>

      {events.length === 0 && page === 1 ? (
        <EmptyState
          title="Review queue is empty"
          detail="Run ingestion or lower confidence thresholds to generate review candidates."
        />
      ) : (
        <>
          <div className="space-y-3">
            {events.map((event) => {
              const mergeSuggestions = rankMergeSuggestions(event, mergeTargets).slice(0, 12);
              const sevColor = severityColor(event.severity);
              const sevBg = severityBg(event.severity);
              const sources = event.rawArticles.map((a) => a.source.name).filter(Boolean);
              const uniqueSources = [...new Set(sources)];

              return (
                <article
                  key={event.id}
                  className="rounded-lg border border-[#2d2d2d] bg-[#1a1a1a] hover:border-[#424754] transition-colors"
                >
                  {/* Card header */}
                  <div className="p-4 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Meta chips */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span
                          className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded border flex items-center gap-1"
                          style={{ color: sevColor, backgroundColor: sevBg, borderColor: `${sevColor}40` }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sevColor }} />
                          {event.severity}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded border border-[#424754] text-[#c2c6d6]">
                          {event.category.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-mono text-[#4edea3]">
                          {Math.round(event.confidence * 100)}% conf.
                        </span>
                        {event.aiEnhanced && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-[#3b82f6]/30 text-[#3b82f6] bg-[#3b82f6]/10">AI</span>
                        )}
                        {event.geocoderUsed && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-[#4edea3]/30 text-[#4edea3] bg-[#4edea3]/10">Geocoded</span>
                        )}
                      </div>

                      <h3 className="text-base font-semibold text-[#e1e2ec] mb-1">{event.title}</h3>
                      <p className="text-sm text-[#c2c6d6] line-clamp-2 mb-2">{event.summary}</p>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-[#8c909f]">
                        {(event.city || event.country) && (
                          <span>
                            📍 {[event.city, event.country].filter(Boolean).join(", ")}
                            {" · "}loc. {Math.round(event.locationConfidence * 100)}%
                          </span>
                        )}
                        {uniqueSources.length > 0 && (
                          <span className="text-[#8c909f]">
                            Sources: {uniqueSources.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <ReviewActions event={event} mergeTargets={mergeSuggestions} />
                    </div>
                  </div>

                  {/* Evidence */}
                  <div className="border-t border-[#2d2d2d] px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-[#8c909f] mb-2">Evidence</div>
                    <div className="space-y-2">
                      {event.rawArticles.map((article) => (
                        <div key={article.id} className="rounded border border-[#2d2d2d] bg-[#191b23] p-3">
                          <a
                            className="text-sm font-medium text-[#3b82f6] hover:underline"
                            href={article.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {article.title}
                          </a>
                          <div className="mt-0.5 text-[10px] font-mono text-[#8c909f]">
                            {article.source.name}
                            {article.publishedAt ? ` · ${article.publishedAt.toISOString().slice(0, 10)}` : ""}
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-xs text-[#c2c6d6]">{article.rawText}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Signals */}
                  {readSignals(event.signals).length > 0 && (
                    <div className="border-t border-[#2d2d2d] px-4 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-[#8c909f] mb-2">Extraction signals</div>
                      <div className="flex flex-wrap gap-1.5">
                        {readSignals(event.signals).map((signal, index) => (
                          <span
                            key={`${signal.label}-${index}`}
                            title={signal.detail}
                            className="rounded border border-[#2d2d2d] bg-[#191b23] px-2 py-0.5 text-[10px] font-mono text-[#c2c6d6]"
                          >
                            {signal.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-between text-xs text-[#8c909f]">
              <span>Page {page} of {totalPages} · {total} events</span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={`/admin/review${page > 2 ? `?page=${page - 1}` : ""}`}
                    className="px-3 py-1.5 rounded border border-[#2d2d2d] hover:border-[#424754] hover:text-[#e1e2ec] transition-colors"
                  >
                    ← Prev
                  </Link>
                ) : (
                  <span className="px-3 py-1.5 rounded border border-[#2d2d2d] opacity-30">← Prev</span>
                )}
                {page < totalPages ? (
                  <Link
                    href={`/admin/review?page=${page + 1}`}
                    className="px-3 py-1.5 rounded border border-[#2d2d2d] hover:border-[#424754] hover:text-[#e1e2ec] transition-colors"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="px-3 py-1.5 rounded border border-[#2d2d2d] opacity-30">Next →</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </AdminGate>
  );
}

type ReviewSignal = {
  label: string;
  detail?: string;
};

function readSignals(value: Prisma.JsonValue): ReviewSignal[] {
  if (!Array.isArray(value)) return [];
  const signals: ReviewSignal[] = [];
  for (const signal of value) {
    if (!signal || typeof signal !== "object" || Array.isArray(signal)) continue;
    const record = signal as Record<string, unknown>;
    if (typeof record.label !== "string") continue;
    signals.push({
      label: record.label,
      detail: typeof record.detail === "string" ? record.detail : undefined
    });
  }
  return signals;
}
