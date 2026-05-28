import Link from "next/link";
import { EventStatus, Severity } from "@prisma/client";
import { EmptyState } from "@/components/empty-state";
import { EventMapClient } from "@/components/event-map-client";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { formatRelativeTime, hoursUntilNextDailyRun } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WINDOW_OPTIONS = [
  { label: "Last 7 days", value: "7d", days: 7 },
  { label: "Last 30 days", value: "30d", days: 30 },
  { label: "All time", value: "all", days: null }
] as const;

function severityTone(severity: Severity) {
  if (severity === Severity.CRITICAL || severity === Severity.HIGH) return "red" as const;
  if (severity === Severity.MEDIUM) return "yellow" as const;
  return "green" as const;
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

  // Filter by occurredAt when available; fall back to createdAt for legacy events (occurredAt null).
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

  const nextUpdateHours = hoursUntilNextDailyRun(now);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Crisis Intelligence Dashboard</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Reviewed risk events from RSS and open-data sources. Raw material is extracted,
            deduplicated, scored, reviewed, and only then published to the map.
          </p>
          {lastIngested?.lastIngestedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Data last updated{" "}
              <span className="font-medium text-foreground">
                {formatRelativeTime(lastIngested.lastIngestedAt, now)}
              </span>
              {" · "}
              Updated daily at 8am UTC · Next update in ~{nextUpdateHours}h
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-2xl font-semibold">{publishedCount}</div>
            <div className="text-muted-foreground">Published</div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-2xl font-semibold">{reviewCount}</div>
            <div className="text-muted-foreground">Needs review</div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-2xl font-semibold">{sourceCount}</div>
            <div className="text-muted-foreground">Sources</div>
          </div>
        </div>
      </section>

      {/* Time window filter */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Showing:</span>
        {WINDOW_OPTIONS.map((opt) => (
          <Link
            key={opt.value}
            href={opt.value === "30d" ? "/" : `/?window=${opt.value}`}
            className={
              windowOption.value === opt.value
                ? "rounded-md border border-border bg-card px-3 py-1.5 font-medium text-foreground shadow-sm"
                : "rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted"
            }
          >
            {opt.label}
          </Link>
        ))}
        {mapEvents.length > 0 && (
          <span className="ml-2 text-muted-foreground">
            · {mapEvents.length} event{mapEvents.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {latestEvents.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
          <EventMapClient events={mapEvents} />
          <section className="max-h-[460px] overflow-hidden rounded-md border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-semibold">Latest events · {windowOption.label.toLowerCase()}</h2>
            </div>
            <div className="max-h-[408px] divide-y divide-border overflow-y-auto">
              {latestEvents.map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="block p-4 hover:bg-muted">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-sm font-medium">{event.title}</h3>
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                        {event.summary}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <Badge tone={severityTone(event.severity)}>{event.severity}</Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatRelativeTime(event.occurredAt ?? event.createdAt, now)}</span>
                    <span>·</span>
                    <span>
                      {[event.city, event.country].filter(Boolean).join(", ") || "Location pending"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <EmptyState
          title={
            windowOption.value === "all"
              ? "No published events yet"
              : `No events in the ${windowOption.label.toLowerCase()}`
          }
          detail={
            windowOption.value === "all"
              ? "Seed sources, run RSS ingestion, then approve candidate events from the review queue."
              : "Try expanding the time window to see older events."
          }
        />
      )}
    </div>
  );
}
