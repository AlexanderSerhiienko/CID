import Link from "next/link";
import { EventStatus, Severity } from "@prisma/client";
import { EmptyState } from "@/components/empty-state";
import { EventMapClient } from "@/components/event-map-client";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function severityTone(severity: Severity) {
  if (severity === Severity.CRITICAL || severity === Severity.HIGH) {
    return "red";
  }
  if (severity === Severity.MEDIUM) {
    return "yellow";
  }
  return "green";
}

export default async function DashboardPage() {
  const [mapEvents, latestEvents, publishedCount, reviewCount, sourceCount] = await Promise.all([
    prisma.riskEvent.findMany({
      where: { status: EventStatus.PUBLISHED },
      orderBy: { createdAt: "desc" },
      take: 250
    }),
    prisma.riskEvent.findMany({
      where: { status: EventStatus.PUBLISHED },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.riskEvent.count({ where: { status: EventStatus.PUBLISHED } }),
    prisma.riskEvent.count({ where: { status: EventStatus.NEEDS_REVIEW } }),
    prisma.source.count({ where: { enabled: true } })
  ]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Crisis Intelligence Dashboard</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Reviewed risk events from RSS and open-data sources. Raw material is extracted,
            deduplicated, scored, reviewed, and only then published to the map.
          </p>
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

      {latestEvents.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
          <EventMapClient events={mapEvents} />
          <section className="max-h-[460px] overflow-hidden rounded-md border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-semibold">Latest published events</h2>
            </div>
            <div className="max-h-[408px] divide-y divide-border overflow-y-auto">
              {latestEvents.map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="block p-4 hover:bg-muted">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-sm font-medium">{event.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {event.summary}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <Badge tone={severityTone(event.severity)}>{event.severity}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    {[event.city, event.country].filter(Boolean).join(", ") || "Location pending"}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <EmptyState
          title="No published events yet"
          detail="Seed sources, run RSS ingestion, then approve candidate events from the review queue."
        />
      )}
    </div>
  );
}
