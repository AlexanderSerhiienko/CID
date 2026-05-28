import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { formatDate, formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const now = new Date();

  const event = await prisma.riskEvent.findUnique({
    where: { id },
    include: {
      rawArticles: {
        include: { source: true },
        orderBy: { publishedAt: "desc" }
      }
    }
  });

  if (!event) {
    notFound();
  }

  function severityTone(severity: string) {
    if (severity === "CRITICAL" || severity === "HIGH") return "red" as const;
    if (severity === "MEDIUM") return "yellow" as const;
    return "green" as const;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/events" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to events
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">{event.title}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">{event.summary}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          First seen{" "}
          <span className="font-medium text-foreground">
            {formatRelativeTime(event.createdAt, now)}
          </span>
          {" · "}
          {formatDate(event.createdAt, now)}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Category</div>
          <div className="mt-2 font-medium">{event.category.replace(/_/g, " ")}</div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Severity</div>
          <div className="mt-2">
            <Badge tone={severityTone(event.severity)}>{event.severity}</Badge>
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Confidence</div>
          <div className="mt-2 font-medium">{Math.round(event.confidence * 100)}%</div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Status</div>
          <div className="mt-2">
            <Badge tone={event.status === "PUBLISHED" ? "green" : "blue"}>{event.status}</Badge>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="font-semibold">Location</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Country</dt>
            <dd className="font-medium">{event.country || "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">City</dt>
            <dd className="font-medium">{event.city || "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Coordinates</dt>
            <dd className="font-medium">
              {event.latitude && event.longitude
                ? `${event.latitude.toFixed(3)}, ${event.longitude.toFixed(3)}`
                : "Not resolved"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Location confidence</dt>
            <dd className="font-medium">{Math.round(event.locationConfidence * 100)}%</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">
            Evidence{" "}
            <span className="font-normal text-muted-foreground">
              ({event.rawArticles.length} source{event.rawArticles.length === 1 ? "" : "s"})
            </span>
          </h2>
        </div>
        <div className="divide-y divide-border">
          {event.rawArticles.map((article) => (
            <div key={article.id} className="p-4">
              <a
                href={article.url}
                className="font-medium text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {article.title}
              </a>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                <span>{article.source.name}</span>
                <span>·</span>
                <span>trust {Math.round(article.source.trustScore * 100)}%</span>
                {article.publishedAt && (
                  <>
                    <span>·</span>
                    <span title={article.publishedAt.toISOString()}>
                      {formatDate(article.publishedAt, now)}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
