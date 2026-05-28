import { Badge } from "@/components/ui/badge";
import { IngestButton, SourceSettings } from "@/components/source-actions";
import { SourceForm } from "@/components/source-form";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const sources = await prisma.source.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { rawArticles: true }
      }
    }
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sources</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage feeds used by the ingestion pipeline.
          </p>
        </div>
        <IngestButton />
      </div>

      <SourceForm />

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Trust</th>
              <th className="px-4 py-3">Articles</th>
              <th className="px-4 py-3">Last ingested</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Settings</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sources.map((source) => (
              <tr key={source.id}>
                <td className="max-w-[360px] px-4 py-3">
                  <div className="font-medium">{source.name}</div>
                  <a className="text-xs text-primary" href={source.url} target="_blank">
                    {source.url}
                  </a>
                  {source.lastError && (
                    <p className="mt-1 truncate text-xs text-red-500" title={source.lastError}>
                      ⚠ {source.lastError}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">{source.type}</td>
                <td className="px-4 py-3">{Math.round(source.trustScore * 100)}%</td>
                <td className="px-4 py-3">{source._count.rawArticles}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {source.lastIngestedAt
                    ? source.lastIngestedAt.toISOString().slice(0, 16).replace("T", " ")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={source.enabled ? "green" : "neutral"}>
                    {source.enabled ? "ENABLED" : "DISABLED"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <SourceSettings
                    sourceId={source.id}
                    enabled={source.enabled}
                    trustScore={source.trustScore}
                  />
                </td>
                <td className="px-4 py-3">
                  <IngestButton sourceId={source.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
