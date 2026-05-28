import Link from "next/link";
import { EventCategory, EventStatus, Severity } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function tone(severity: Severity) {
  if (severity === Severity.CRITICAL || severity === Severity.HIGH) {
    return "red";
  }
  if (severity === Severity.MEDIUM) {
    return "yellow";
  }
  return "green";
}

const CATEGORY_LABELS: Record<EventCategory, string> = {
  DISEASE_OUTBREAK: "Disease Outbreak",
  NATURAL_DISASTER: "Natural Disaster",
  CYBER_ATTACK: "Cyber Attack",
  TRANSPORT_DISRUPTION: "Transport Disruption",
  POLITICAL_UNREST: "Political Unrest",
  FOOD_SAFETY_ALERT: "Food Safety Alert",
  UNKNOWN: "Unknown"
};

export default async function EventsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : EventStatus.PUBLISHED;
  const category = typeof params.category === "string" ? params.category : "";
  const severity = typeof params.severity === "string" ? params.severity : "";
  const page = Math.max(1, parseInt(typeof params.page === "string" ? params.page : "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const parsedCategory =
    category && Object.values(EventCategory).includes(category as EventCategory)
      ? (category as EventCategory)
      : undefined;
  const parsedSeverity =
    severity && Object.values(Severity).includes(severity as Severity)
      ? (severity as Severity)
      : undefined;

  const where = {
    status: status as EventStatus,
    category: parsedCategory,
    severity: parsedSeverity,
    OR: q
      ? [
          { title: { contains: q, mode: "insensitive" as const } },
          { summary: { contains: q, mode: "insensitive" as const } },
          { country: { contains: q, mode: "insensitive" as const } },
          { city: { contains: q, mode: "insensitive" as const } }
        ]
      : undefined
  };

  const [events, total] = await Promise.all([
    prisma.riskEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE
    }),
    prisma.riskEvent.count({ where })
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function pageUrl(p: number) {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (status !== EventStatus.PUBLISHED) qs.set("status", status);
    if (category) qs.set("category", category);
    if (severity) qs.set("severity", severity);
    if (p > 1) qs.set("page", String(p));
    const str = qs.toString();
    return `/events${str ? `?${str}` : ""}`;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search and filter normalized risk events.
        </p>
      </div>

      <form className="grid grid-cols-2 gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title, summary, country, city"
          className="col-span-2 h-10 rounded-md border border-border bg-background px-3 text-sm md:col-span-1"
        />
        <select
          name="category"
          defaultValue={category}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="">All categories</option>
          {Object.values(EventCategory).map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
        <select
          name="severity"
          defaultValue={severity}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="">All severities</option>
          {Object.values(Severity).map((sev) => (
            <option key={sev} value={sev}>
              {sev}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
        >
          {Object.values(EventStatus).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Filter
        </button>
      </form>

      {total > 0 && (
        <p className="text-sm text-muted-foreground">
          {total} event{total !== 1 ? "s" : ""} found
          {parsedCategory ? ` · ${CATEGORY_LABELS[parsedCategory]}` : ""}
          {parsedSeverity ? ` · ${parsedSeverity}` : ""}
        </p>
      )}

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No events match the current filters.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id} className="hover:bg-muted/60">
                  <td className="max-w-[360px] px-4 py-3">
                    <Link href={`/events/${event.id}`} className="font-medium">
                      {event.title}
                    </Link>
                    <p className="mt-1 line-clamp-1 text-muted-foreground">{event.summary}</p>
                  </td>
                  <td className="px-4 py-3">{CATEGORY_LABELS[event.category]}</td>
                  <td className="px-4 py-3">
                    {[event.city, event.country].filter(Boolean).join(", ") || "Unknown"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={tone(event.severity)}>{event.severity}</Badge>
                  </td>
                  <td className="px-4 py-3">{Math.round(event.confidence * 100)}%</td>
                  <td className="px-4 py-3">
                    <Badge tone={event.status === EventStatus.PUBLISHED ? "green" : "blue"}>
                      {event.status}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDate(event.createdAt, now)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} · {total} events
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={pageUrl(page - 1)}
                className="rounded-md border border-border bg-card px-3 py-1.5 hover:bg-muted"
              >
                ← Prev
              </Link>
            ) : (
              <span className="rounded-md border border-border px-3 py-1.5 text-muted-foreground opacity-40">
                ← Prev
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={pageUrl(page + 1)}
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
    </div>
  );
}
