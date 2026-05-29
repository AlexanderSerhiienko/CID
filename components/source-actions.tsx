"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getAdminHeaders, parseMutationResponse } from "@/lib/admin-client";

export function IngestButton({ sourceId }: { sourceId?: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function ingest() {
    setIsLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/ingest/rss", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify(sourceId ? { sourceId } : {})
      });
      const result = await parseMutationResponse(response);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      const results = Array.isArray(result.payload?.results) ? result.payload.results : [];
      const okCount = results.filter((result: { ok: boolean }) => result.ok).length;
      const errorCount = results.length - okCount;
      setMessage(
        `Ingested ${okCount} source${okCount === 1 ? "" : "s"}${errorCount ? `, ${errorCount} failed` : ""}.`
      );
      router.refresh();
    } catch {
      setMessage("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button onClick={ingest} disabled={isLoading} variant="secondary" title="Run RSS ingestion">
        <RefreshCw className="mr-2 h-4 w-4" />
        {isLoading ? "Running" : "Ingest"}
      </Button>
      {message ? <div className="text-xs text-muted-foreground">{message}</div> : null}
    </div>
  );
}

export function SourceSettings({
  sourceId,
  enabled,
  trustScore
}: {
  sourceId: string;
  enabled: boolean;
  trustScore: number;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function patch(payload: { enabled?: boolean; trustScore?: number }) {
    setIsLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/sources/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify(payload)
      });
      const result = await parseMutationResponse(response);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage("Updated.");
      router.refresh();
    } catch {
      setMessage("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={isLoading}
          onClick={() => patch({ enabled: !enabled })}
        >
          {enabled ? "Disable" : "Enable"}
        </Button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Trust
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            defaultValue={trustScore}
            className="h-9 w-20 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            onBlur={(event) => patch({ trustScore: Number(event.currentTarget.value) })}
          />
        </label>
      </div>
      {message ? <div className="text-xs text-muted-foreground">{message}</div> : null}
    </div>
  );
}
