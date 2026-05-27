import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await prisma.riskEvent.findUnique({
    where: { id },
    include: {
      rawArticles: {
        include: { source: true }
      }
    }
  });

  if (!event) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/events" className="text-sm text-muted-foreground hover:text-foreground">
          Back to events
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">{event.title}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">{event.summary}</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Category</div>
          <div className="mt-2 font-medium">{event.category}</div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Severity</div>
          <div className="mt-2">
            <Badge tone="yellow">{event.severity}</Badge>
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Confidence</div>
          <div className="mt-2 font-medium">{Math.round(event.confidence * 100)}%</div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Status</div>
          <div className="mt-2">
            <Badge tone="blue">{event.status}</Badge>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="font-semibold">Location</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Country</dt>
            <dd className="font-medium">{event.country || "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">City</dt>
            <dd className="font-medium">{event.city || "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Location confidence</dt>
            <dd className="font-medium">{Math.round(event.locationConfidence * 100)}%</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Evidence</h2>
        </div>
        <div className="divide-y divide-border">
          {event.rawArticles.map((article) => (
            <div key={article.id} className="p-4">
              <a href={article.url} className="font-medium text-primary" target="_blank">
                {article.title}
              </a>
              <div className="mt-1 text-sm text-muted-foreground">
                {article.source.name} · trust {Math.round(article.source.trustScore * 100)}%
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
