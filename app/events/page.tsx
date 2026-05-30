import Link from "next/link";
import { EventCategory, EventStatus, Severity } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const CATEGORY_SHORT: Record<EventCategory, string> = {
  DISEASE_OUTBREAK: "DISEASE",
  NATURAL_DISASTER: "DISASTER",
  CYBER_ATTACK: "CYBER",
  TRANSPORT_DISRUPTION: "TRANSPORT",
  POLITICAL_UNREST: "POLITICAL",
  FOOD_SAFETY_ALERT: "FOOD",
  UNKNOWN: "UNKNOWN"
};

const CATEGORY_LABELS: Record<EventCategory, string> = {
  DISEASE_OUTBREAK: "Disease Outbreak",
  NATURAL_DISASTER: "Natural Disaster",
  CYBER_ATTACK: "Cyber Attack",
  TRANSPORT_DISRUPTION: "Transport Disruption",
  POLITICAL_UNREST: "Political Unrest",
  FOOD_SAFETY_ALERT: "Food Safety Alert",
  UNKNOWN: "Unknown"
};

function severityColor(severity: Severity): string {
  if (severity === Severity.CRITICAL) return "#ffb4ab";
  if (severity === Severity.HIGH) return "#ffb786";
  if (severity === Severity.MEDIUM) return "#4edea3";
  return "#8c909f";
}

function statusChipClass(status: EventStatus): string {
  if (status === EventStatus.PUBLISHED) return "status-published";
  if (status === EventStatus.NEEDS_REVIEW) return "status-needs-review";
  if (status === EventStatus.REJECTED) return "status-rejected";
  return "status-draft";
}

export default async function EventsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const ALLOWED_STATUSES: EventStatus[] = [EventStatus.PUBLISHED];
  const rawStatus = typeof params.status === "string" ? params.status : "";
  const status: EventStatus = ALLOWED_STATUSES.includes(rawStatus as EventStatus)
    ? (rawStatus as EventStatus)
    : EventStatus.PUBLISHED;
  const category = typeof params.category === "string" ? params.category : "";
  const severity = typeof params.severity === "string" ? params.severity : "";
  const rawPage = parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const page = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage);
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
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#e1e2ec] tracking-tight">Events Registry</h1>
          <p className="mt-1 text-sm text-[#c2c6d6]">
            Manage and review global intelligence events.
            {total > 0 && (
              <span className="ml-2 text-[#8c909f]">
                {total} event{total !== 1 ? "s" : ""}
                {parsedCategory ? ` · ${CATEGORY_LABELS[parsedCategory]}` : ""}
                {parsedSeverity ? ` · ${parsedSeverity}` : ""}
              </span>
            )}
          </p>
        </div>
        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/events"
            className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest border transition-colors ${
              !parsedSeverity && !parsedCategory
                ? "bg-[#3b82f6] text-white border-[#3b82f6]"
                : "bg-[#1a1a1a] text-[#c2c6d6] border-[#2d2d2d] hover:border-[#3b82f6] hover:text-[#3b82f6]"
            }`}
          >
            All Events
          </Link>
          <Link
            href="/events?severity=CRITICAL"
            className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest border transition-colors ${
              parsedSeverity === Severity.CRITICAL
                ? "bg-[#ffb4ab]/20 text-[#ffb4ab] border-[#ffb4ab]/50"
                : "bg-[#1a1a1a] text-[#c2c6d6] border-[#2d2d2d] hover:border-[#ffb4ab] hover:text-[#ffb4ab]"
            }`}
          >
            Critical Only
          </Link>
        </div>
      </div>

      {/* Search & filter form */}
      <form className="flex flex-wrap gap-2 mb-5">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search events…"
          className="h-9 rounded border border-[#2d2d2d] bg-[#1a1a1a] px-3 text-sm text-[#e1e2ec] placeholder-[#8c909f] focus:outline-none focus:border-[#3b82f6] w-56 transition-colors"
        />
        <select
          name="category"
          defaultValue={category}
          className="h-9 rounded border border-[#2d2d2d] bg-[#1a1a1a] px-3 text-sm text-[#e1e2ec] focus:outline-none focus:border-[#3b82f6] transition-colors"
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
          className="h-9 rounded border border-[#2d2d2d] bg-[#1a1a1a] px-3 text-sm text-[#e1e2ec] focus:outline-none focus:border-[#3b82f6] transition-colors"
        >
          <option value="">All severities</option>
          {Object.values(Severity).map((sev) => (
            <option key={sev} value={sev}>{sev}</option>
          ))}
        </select>
        <button className="h-9 px-4 rounded bg-[#3b82f6] text-sm font-semibold text-white hover:opacity-90 transition-opacity">
          Filter
        </button>
        {(q || parsedCategory || parsedSeverity) && (
          <Link
            href="/events"
            className="h-9 px-4 rounded border border-[#2d2d2d] text-sm text-[#c2c6d6] hover:border-[#424754] transition-colors flex items-center"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="bg-[#1a1a1a] border border-[#2d2d2d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-[#2d2d2d] bg-[#191b23]">
                <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-[#8c909f] w-[14%]">Category</th>
                <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-[#8c909f] w-[30%]">Event Title</th>
                <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-[#8c909f] w-[16%]">Location</th>
                <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-[#8c909f] w-[10%]">Severity</th>
                <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-[#8c909f] w-[10%]">Conf.</th>
                <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-[#8c909f] w-[14%]">Status</th>
                <th className="py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-[#8c909f] w-[12%] text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-[#8c909f]">
                    No events match the current filters.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr
                    key={event.id}
                    className="border-b border-[#2d2d2d] last:border-0 hover:bg-[#252525] transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: severityColor(event.severity) }}
                        />
                        <span className="text-xs font-mono text-[#c2c6d6]">
                          {CATEGORY_SHORT[event.category]}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Link href={`/events/${event.id}`} className="text-sm font-medium text-[#e1e2ec] hover:text-[#3b82f6] transition-colors line-clamp-1">
                        {event.title}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-sm text-[#c2c6d6]">
                      {[event.city, event.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="text-xs font-semibold"
                        style={{ color: severityColor(event.severity) }}
                      >
                        {event.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-[#8c909f]">
                      {Math.round(event.confidence * 100)}%
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded border ${statusChipClass(event.status)}`}>
                        {event.status.replace("_", " ")}
                      </span>
                    </td>
                    <td
                      className="py-3 px-4 text-right text-xs font-mono text-[#8c909f] whitespace-nowrap"
                      title={event.occurredAt ? `Occurred: ${event.occurredAt.toISOString()}` : `First seen: ${event.createdAt.toISOString()}`}
                    >
                      {formatDate(event.occurredAt ?? event.createdAt, now)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-[#2d2d2d] bg-[#191b23] px-4 py-2.5 flex items-center justify-between text-xs text-[#8c909f]">
            <span>Showing {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} of {total} events</span>
            <div className="flex items-center gap-1">
              {page > 1 ? (
                <Link href={pageUrl(page - 1)} className="px-3 py-1 rounded border border-[#2d2d2d] hover:border-[#424754] hover:text-[#e1e2ec] transition-colors">
                  ←
                </Link>
              ) : (
                <span className="px-3 py-1 rounded border border-[#2d2d2d] opacity-30">←</span>
              )}
              <span className="px-3 py-1">Page {page} of {totalPages}</span>
              {page < totalPages ? (
                <Link href={pageUrl(page + 1)} className="px-3 py-1 rounded border border-[#2d2d2d] hover:border-[#424754] hover:text-[#e1e2ec] transition-colors">
                  →
                </Link>
              ) : (
                <span className="px-3 py-1 rounded border border-[#2d2d2d] opacity-30">→</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
