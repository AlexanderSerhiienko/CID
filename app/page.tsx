import Link from "next/link";
import { EventStatus, Severity } from "@prisma/client";
import { EmptyState } from "@/components/empty-state";
import { EventMapClient } from "@/components/event-map-client";
import { prisma } from "@/lib/db";
import { formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WINDOW_OPTIONS = [
  { label: "Last 7 days", value: "7d", days: 7 },
  { label: "Last 30 days", value: "30d", days: 30 },
  { label: "All time", value: "all", days: null }
] as const;

function severityColor(severity: Severity) {
  if (severity === Severity.CRITICAL) return "#ffb4ab";
  if (severity === Severity.HIGH) return "#ffb786";
  if (severity === Severity.MEDIUM) return "#4edea3";
  return "#8c909f";
}

function severityClass(severity: Severity) {
  if (severity === Severity.CRITICAL) return "severity-critical";
  if (severity === Severity.HIGH) return "severity-high";
  if (severity === Severity.MEDIUM) return "severity-medium";
  return "severity-low";
}

function cutoffDate(days: number | null): Date | null {
  if (days === null) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  const params = await searchParams;
  const windowParam = typeof params.window === "string" ? params.window : "30d";
  const windowOption =
    WINDOW_OPTIONS.find((w) => w.value === windowParam) ?? WINDOW_OPTIONS[1];

  const cutoff = cutoffDate(windowOption.days);

  const timeFilter = cutoff
    ? {
        OR: [
          { occurredAt: { gte: cutoff } },
          { occurredAt: null, createdAt: { gte: cutoff } }
        ]
      }
    : {};

  const baseWhere = { status: EventStatus.PUBLISHED, ...timeFilter };

  const [mapEvents, latestEvents, publishedCount, reviewCount, sourceCount, lastIngested] =
    await Promise.all([
      prisma.riskEvent.findMany({
        where: baseWhere,
        orderBy: { createdAt: "desc" },
        take: 500
      }),
      prisma.riskEvent.findMany({
        where: baseWhere,
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      prisma.riskEvent.count({ where: { status: EventStatus.PUBLISHED } }),
      prisma.riskEvent.count({ where: { status: EventStatus.NEEDS_REVIEW } }),
      prisma.source.count({ where: { enabled: true } }),
      prisma.source.findFirst({
        where: { enabled: true, lastIngestedAt: { not: null } },
        orderBy: { lastIngestedAt: "desc" },
        select: { lastIngestedAt: true }
      })
    ]);


  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden max-w-[1600px] mx-auto w-full">
      {/* Map area — 70% */}
      <section className="flex-1 relative bg-[#0b0e15]">
        <EventMapClient events={mapEvents} />
        {/* Overlay info */}
        <div className="absolute bottom-6 left-6 z-10 pointer-events-none">
          <div className="surface-card rounded-lg p-4 backdrop-blur-sm bg-[#1a1a1a]/90 max-w-xs">
            <p className="text-sm font-semibold text-[#e1e2ec]">Global Operations Overview</p>
            <p className="text-xs text-[#c2c6d6] mt-0.5">
              Live incident tracking enabled
            </p>
          </div>
        </div>
      </section>

      {/* Sidebar — 30% */}
      <aside className="w-80 xl:w-96 flex flex-col surface-card border-l border-[#2d2d2d] overflow-hidden bg-[#1a1a1a]">
        {/* Time window filter */}
        <div className="px-4 pt-4 pb-3 border-b border-[#2d2d2d] flex items-center gap-1.5">
          {WINDOW_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={opt.value === "30d" ? "/" : `/?window=${opt.value}`}
              className={
                windowOption.value === opt.value
                  ? "px-3 py-1 rounded-full text-xs font-semibold bg-[#3b82f6] text-white"
                  : "px-3 py-1 rounded-full text-xs font-semibold border border-[#2d2d2d] text-[#c2c6d6] hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors"
              }
            >
              {opt.label}
            </Link>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="p-4 border-b border-[#2d2d2d]">
          <h2 className="text-sm font-semibold text-[#e1e2ec] mb-3">Quick Stats</h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#191b23] border border-[#2d2d2d] rounded p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#8c909f] mb-1">Published</div>
              <div className="text-xl font-semibold text-[#3b82f6]">{publishedCount}</div>
            </div>
            <div className="bg-[#191b23] border border-[#2d2d2d] rounded p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#8c909f] mb-1">Review</div>
              <div className="text-xl font-semibold text-[#ffb786]">{reviewCount}</div>
            </div>
            <div className="bg-[#191b23] border border-[#2d2d2d] rounded p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#8c909f] mb-1">Sources</div>
              <div className="text-xl font-semibold text-[#e1e2ec]">{sourceCount}</div>
            </div>
          </div>
        </div>

        {/* Recent Events */}
        <div className="flex-1 flex flex-col min-h-0 p-4">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h2 className="text-sm font-semibold text-[#e1e2ec]">
              Recent Events
              <span className="ml-2 text-[10px] font-normal text-[#8c909f] uppercase tracking-widest">
                {windowOption.label}
              </span>
            </h2>
            <Link
              href="/events"
              className="text-xs text-[#3b82f6] hover:underline"
            >
              View all →
            </Link>
          </div>

          {latestEvents.length > 0 ? (
            <div className="space-y-1.5 overflow-y-auto flex-1">
              {latestEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="block p-3 rounded border border-[#2d2d2d] bg-[#191b23] hover:border-[#424754] hover:bg-[#272a31] transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="text-xs font-semibold text-[#e1e2ec] line-clamp-2 leading-snug">
                      {event.title}
                    </h3>
                    <span
                      className={`shrink-0 text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded border ${severityClass(event.severity)}`}
                    >
                      {event.severity}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-[#8c909f]">
                    <span style={{ color: severityColor(event.severity) }}>●</span>
                    <span>{formatRelativeTime(event.occurredAt ?? event.createdAt, now)}</span>
                    {(event.city || event.country) && (
                      <>
                        <span>·</span>
                        <span>{[event.city, event.country].filter(Boolean).join(", ")}</span>
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No events yet"
              detail={
                windowOption.value === "all"
                  ? "Seed sources, run ingestion, then approve candidates."
                  : "Try expanding the time window."
              }
            />
          )}
        </div>
      </aside>
    </div>
  );
}
