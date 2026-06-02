import Link from "next/link";
import { EventStatus, Prisma, Severity } from "@prisma/client";
import { EmptyState } from "@/components/empty-state";
import { ReviewActions } from "@/components/review-actions";
import { BulkApproveButton } from "@/components/bulk-approve-button";
import { AutoEnricher } from "@/components/auto-enricher";
import { PromoteArticleButton } from "@/components/promote-article-button";
import { AdminGate } from "@/components/admin-gate";
import { prisma } from "@/lib/db";
import { rankMergeSuggestions } from "@/lib/review/merge-suggestions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type Tab = "ai" | "georss" | "rules" | "filtered";

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
  const rawTab = typeof params.tab === "string" ? params.tab : "ai";
  const tab: Tab = rawTab === "georss" ? "georss" : rawTab === "rules" ? "rules" : rawTab === "filtered" ? "filtered" : "ai";

  // Always-needed: counts for stats strip + tab badges
  const [
    aiEnrichedCount,
    geoCount,
    rulesCount,
    statAiEnriched,
    statPublished,
    statRejected,
    aiPendingCount,
    aiRejectedCount,
  ] = await Promise.all([
    prisma.riskEvent.count({ where: { status: EventStatus.NEEDS_REVIEW, aiEnhanced: true } }),
    prisma.riskEvent.count({ where: { status: EventStatus.NEEDS_REVIEW, extractionSource: "georss", aiEnhanced: false } }),
    prisma.riskEvent.count({ where: { status: EventStatus.NEEDS_REVIEW, extractionSource: "rules", aiEnhanced: false } }),
    prisma.riskEvent.count({ where: { aiEnhanced: true } }),
    prisma.riskEvent.count({ where: { status: EventStatus.PUBLISHED } }),
    prisma.riskEvent.count({ where: { status: EventStatus.REJECTED } }),
    prisma.rawArticle.count({ where: { aiPending: true } }),
    prisma.rawArticle.count({ where: { aiRejected: true } }),
  ]);

  // Tab-conditional data
  const mergeWindow = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

  const [events, mergeTargets, rejectedArticles] = await Promise.all([
    tab === "ai"
      ? prisma.riskEvent.findMany({
          where: { status: EventStatus.NEEDS_REVIEW, aiEnhanced: true },
          orderBy: { createdAt: "asc" },
          take: PAGE_SIZE,
          include: { rawArticles: { include: { source: true } } },
        })
      : tab === "georss"
      ? prisma.riskEvent.findMany({
          where: { status: EventStatus.NEEDS_REVIEW, extractionSource: "georss", aiEnhanced: false },
          orderBy: { createdAt: "asc" },
          take: PAGE_SIZE,
          include: { rawArticles: { include: { source: true } } },
        })
      : tab === "rules"
      ? prisma.riskEvent.findMany({
          where: { status: EventStatus.NEEDS_REVIEW, extractionSource: "rules", aiEnhanced: false },
          orderBy: { createdAt: "asc" },
          take: PAGE_SIZE,
          include: { rawArticles: { include: { source: true } } },
        })
      : Promise.resolve([]),
    tab !== "filtered"
      ? prisma.riskEvent.findMany({
          where: {
            status: { not: EventStatus.REJECTED },
            updatedAt: { gte: mergeWindow },
          },
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, summary: true, category: true, status: true, country: true, city: true, updatedAt: true },
        })
      : Promise.resolve([]),
    tab === "filtered"
      ? prisma.rawArticle.findMany({
          where: { aiRejected: true },
          orderBy: { createdAt: "desc" },
          take: PAGE_SIZE,
          select: { id: true, title: true, url: true, createdAt: true, rawText: true, source: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  return (
    <AdminGate>
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-[#e1e2ec] tracking-tight">Admin Review</h1>
          <div className="flex items-center gap-3">
            {tab !== "filtered" && <AutoEnricher />}
            {tab === "ai" && aiEnrichedCount > 0 && <BulkApproveButton pendingCount={aiEnrichedCount} />}
          </div>
        </div>

        {/* Compact stats bar */}
        <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-[#2d2d2d] bg-[#1a1a1a] px-4 py-2.5 text-sm">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8c909f]">In queue</span>
            <span className={aiEnrichedCount + geoCount + rulesCount > 0 ? "font-semibold text-[#ffb786]" : "font-semibold text-[#4edea3]"}>
              {aiEnrichedCount + geoCount + rulesCount}
            </span>
          </div>
          <div className="h-4 w-px bg-[#2d2d2d]" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8c909f]">Enriching</span>
            <span className={aiPendingCount > 0 ? "font-semibold text-[#f59e0b]" : "font-semibold text-[#8c909f]"}>
              {aiPendingCount}
            </span>
          </div>
          <div className="h-4 w-px bg-[#2d2d2d]" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8c909f]">AI ready</span>
            <span className="font-semibold text-[#3b82f6]">{statAiEnriched}</span>
          </div>
          <div className="h-4 w-px bg-[#2d2d2d]" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8c909f]">Published</span>
            <span className="font-semibold text-[#4edea3]">{statPublished}</span>
          </div>
          <div className="h-4 w-px bg-[#2d2d2d]" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8c909f]">Rejected</span>
            <span className="font-semibold text-[#8c909f]">{statRejected}</span>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="mb-6 flex items-center gap-1 border-b border-[#2d2d2d]">
          <TabLink href="/admin/review" active={tab === "ai"} color="#3b82f6" count={aiEnrichedCount}>
            AI Ready
          </TabLink>
          <TabLink href="/admin/review?tab=georss" active={tab === "georss"} color="#4edea3" count={geoCount}>
            Coordinates
          </TabLink>
          <TabLink href="/admin/review?tab=rules" active={tab === "rules"} color="#a78bfa" count={rulesCount}>
            Needs Enrichment
          </TabLink>
          <TabLink href="/admin/review?tab=filtered" active={tab === "filtered"} color="#8c909f" count={aiRejectedCount}>
            AI Rejected
          </TabLink>
        </div>

        {/* ── AI READY TAB ── */}
        {tab === "ai" && (
          events.length === 0 ? (
            aiPendingCount > 0 ? (
              <EmptyState
                title="Enrichment is running"
                detail={`Processing ${aiPendingCount} article${aiPendingCount !== 1 ? "s" : ""} in the background. Events will appear here when ready.`}
              />
            ) : (
              <div className="rounded-lg border border-[#4edea3]/20 bg-[#4edea3]/5 px-6 py-10 text-center">
                <div className="text-3xl mb-3 text-[#4edea3]">✓</div>
                <div className="text-base font-semibold text-[#4edea3] mb-1">
                  {statPublished > 0 ? `All clear - ${statPublished} events live` : "Queue is clear"}
                </div>
                <div className="text-sm text-[#8c909f]">
                  {statPublished > 0
                    ? <>Nothing needs review right now. <Link href="/events" className="text-[#4edea3] hover:underline">View published events</Link>.</>
                    : "Run ingestion to generate new events."}
                </div>
              </div>
            )
          ) : (
            <div className="space-y-3">
              {(events as Awaited<ReturnType<typeof prisma.riskEvent.findMany>>).map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  mergeTargets={mergeTargets}
                  showEvidence
                  showSignals
                />
              ))}
            </div>
          )
        )}

        {/* ── GEORSS TAB ── */}
        {tab === "georss" && (
          events.length === 0 ? (
            <EmptyState
              title="No coordinate-fed events pending"
              detail="All events created from feed coordinates have been reviewed."
            />
          ) : (
            <div className="space-y-3">
              {(events as Awaited<ReturnType<typeof prisma.riskEvent.findMany>>).map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  mergeTargets={mergeTargets}
                />
              ))}
            </div>
          )
        )}

        {/* ── NOT AI ENRICHED TAB ── */}
        {tab === "rules" && (
          events.length === 0 ? (
            <EmptyState
              title="No events waiting for enrichment"
              detail="All deterministic candidates have either been enriched or reviewed."
            />
          ) : (
            <div className="space-y-3">
              {(events as Awaited<ReturnType<typeof prisma.riskEvent.findMany>>).map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  mergeTargets={mergeTargets}
                />
              ))}
            </div>
          )
        )}

        {/* ── AI FILTERED TAB ── */}
        {tab === "filtered" && (
          rejectedArticles.length === 0 ? (
            <EmptyState
              title="No AI-rejected articles"
              detail="There are no articles waiting for human override."
            />
          ) : (
            <div className="space-y-2">
              {rejectedArticles.map((article) => (
                <article
                  key={article.id}
                  className="rounded-lg border border-[#2d2d2d] bg-[#1a1a1a] hover:border-[#424754] transition-colors"
                >
                  <div className="p-4 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded border border-[#424754] text-[#8c909f]">
                          AI marked not relevant
                        </span>
                        <span className="text-[10px] text-[#8c909f]">{article.source.name}</span>
                        <span className="text-[10px] font-mono text-[#8c909f]">
                          {article.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-[#e1e2ec] mb-1">{article.title}</h3>
                      <p className="text-[11px] text-[#8c909f] line-clamp-2">{article.rawText.slice(0, 300)}</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <PromoteArticleButton articleId={article.id} />
                      <span className="text-[9px] text-[#8c909f]">sends article to review queue</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )
        )}
      </div>
    </AdminGate>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabLink({
  href,
  active,
  color,
  count,
  children,
}: {
  href: string;
  active: boolean;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? "text-[#e1e2ec]" : "border-transparent text-[#8c909f] hover:text-[#c2c6d6]"
      }`}
      style={active ? { borderColor: color } : undefined}
    >
      {children}
      {count > 0 && (
        <span
          className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          style={
            active
              ? { backgroundColor: `${color}33`, color }
              : { backgroundColor: "#2d2d2d", color: "#8c909f" }
          }
        >
          {count}
        </span>
      )}
    </Link>
  );
}

type RiskEvent = Awaited<ReturnType<typeof prisma.riskEvent.findMany>>[number];
type MergeTarget = Parameters<typeof rankMergeSuggestions>[1][number];

function EventCard({
  event,
  mergeTargets,
  showEvidence = false,
  showSignals = false,
}: {
  event: RiskEvent;
  mergeTargets: MergeTarget[];
  showEvidence?: boolean;
  showSignals?: boolean;
}) {
  const mergeSuggestions = rankMergeSuggestions(event, mergeTargets).slice(0, 12);
  const sevColor = severityColor(event.severity);
  const sevBg = severityBg(event.severity);
  const articles = (event as RiskEvent & { rawArticles: Array<{ id: string; url: string; title: string; publishedAt: Date | null; rawText: string; source: { name: string } }> }).rawArticles;
  const uniqueSources = [...new Set(articles.map((a) => a.source.name).filter(Boolean))];

  return (
    <article className="rounded-lg border border-[#2d2d2d] bg-[#1a1a1a] hover:border-[#424754] transition-colors">
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
            <span className="text-[10px] font-mono text-[#4edea3]">{Math.round(event.confidence * 100)}% conf.</span>
            {event.geocoderUsed && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-[#4edea3]/30 text-[#4edea3] bg-[#4edea3]/10">Geocoded</span>
            )}
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              event.extractionSource === "ai" ? "border-[#3b82f6]/30 text-[#3b82f6]" :
              event.extractionSource === "georss" ? "border-[#4edea3]/30 text-[#4edea3]" : "border-[#424754] text-[#8c909f]"
            }`}>
              {event.extractionSource}
            </span>
          </div>

          <h3 className="text-base font-semibold text-[#e1e2ec] mb-1">{event.title}</h3>
          <p className="text-sm text-[#c2c6d6] line-clamp-2 mb-3">{event.summary}</p>

          {/* Data quality grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            <div className="rounded border border-[#2d2d2d] bg-[#191b23] px-2.5 py-1.5">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-[#8c909f] mb-0.5">Location</div>
              {event.city || event.country
                ? <div className="text-[11px] text-[#e1e2ec]">{[event.city, event.country].filter(Boolean).join(", ")}</div>
                : <div className="text-[11px] text-[#ff4d4f]">missing</div>}
            </div>
            <div className="rounded border border-[#2d2d2d] bg-[#191b23] px-2.5 py-1.5">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-[#8c909f] mb-0.5">Coordinates</div>
              {event.latitude != null && event.longitude != null
                ? <div className="text-[11px] font-mono text-[#4edea3]">{event.latitude.toFixed(3)}, {event.longitude.toFixed(3)}</div>
                : <div className="text-[11px] text-[#ffb786]">no coords</div>}
            </div>
            <div className="rounded border border-[#2d2d2d] bg-[#191b23] px-2.5 py-1.5">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-[#8c909f] mb-0.5">Loc. confidence</div>
              <div className={`text-[11px] font-mono ${
                event.locationConfidence >= 0.75 ? "text-[#4edea3]" :
                event.locationConfidence >= 0.5  ? "text-[#ffb786]" : "text-[#ff4d4f]"
              }`}>
                {Math.round(event.locationConfidence * 100)}% · {
                  event.locationConfidence >= 0.75 ? "precise" :
                  event.locationConfidence >= 0.5  ? "country" : "low"
                }
              </div>
            </div>
            <div className="rounded border border-[#2d2d2d] bg-[#191b23] px-2.5 py-1.5">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-[#8c909f] mb-0.5">Occurred</div>
              <div className="text-[11px] text-[#c2c6d6]">{event.occurredAt ? event.occurredAt.toISOString().slice(0, 10) : "—"}</div>
            </div>
          </div>

          {uniqueSources.length > 0 && (
            <div className="text-[10px] text-[#8c909f]">Sources: {uniqueSources.join(", ")}</div>
          )}
        </div>

        <div className="shrink-0">
          <ReviewActions event={event} mergeTargets={mergeSuggestions} />
        </div>
      </div>

      {/* Evidence — only on AI tab */}
      {showEvidence && articles.length > 0 && (
        <div className="border-t border-[#2d2d2d] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#8c909f] mb-2">Evidence</div>
          <div className="space-y-2">
            {articles.map((article) => (
              <div key={article.id} className="rounded border border-[#2d2d2d] bg-[#191b23] p-3">
                <a className="text-sm font-medium text-[#3b82f6] hover:underline" href={article.url} target="_blank" rel="noreferrer">
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
      )}

      {/* Signals — only on AI tab */}
      {showSignals && readSignals(event.signals).length > 0 && (
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type ReviewSignal = { label: string; detail?: string };

function readSignals(value: Prisma.JsonValue): ReviewSignal[] {
  if (!Array.isArray(value)) return [];
  const signals: ReviewSignal[] = [];
  for (const signal of value) {
    if (!signal || typeof signal !== "object" || Array.isArray(signal)) continue;
    const record = signal as Record<string, unknown>;
    if (typeof record.label !== "string") continue;
    signals.push({ label: record.label, detail: typeof record.detail === "string" ? record.detail : undefined });
  }
  return signals;
}
