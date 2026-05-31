"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getAdminHeaders } from "@/lib/admin-client";

type EnrichResult = {
  processed: number;
  notRisk: number;
  skipped: number;
  remaining: number;
};

type Props =
  | { pendingCount: number; articleId?: undefined }   // "Enrich all" mode
  | { articleId: string; pendingCount: 1 };            // single-article mode

export function EnrichButton({ pendingCount, articleId }: Props) {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [totals, setTotals] = useState({ processed: 0, notRisk: 0, skipped: 0 });
  const [remaining, setRemaining] = useState(articleId ? 1 : pendingCount);

  const isSingle = Boolean(articleId);

  async function runEnrichment() {
    setState("running");
    let rem = isSingle ? 1 : remaining;
    const acc = { processed: 0, notRisk: 0, skipped: 0 };

    do {
      const resp = await fetch("/api/admin/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify(articleId ? { articleId } : {})
      });
      if (!resp.ok) break;
      const result: EnrichResult = await resp.json();
      acc.processed += result.processed;
      acc.notRisk += result.notRisk;
      acc.skipped += result.skipped;
      rem = isSingle ? 0 : result.remaining;
      setTotals({ ...acc });
      setRemaining(rem);
      // 3s between batches — respects Groq rate limit across container boundaries
      if (rem > 0) await new Promise((r) => setTimeout(r, 3_000));
    } while (rem > 0);

    setState("done");
  }

  if (state === "idle") {
    return (
      <Button onClick={runEnrichment} variant="secondary">
        {isSingle ? "✨ Enrich" : `✨ Enrich ${remaining} with AI`}
      </Button>
    );
  }

  if (state === "running") {
    return (
      <div className="flex items-center gap-2 text-sm text-[#c2c6d6]">
        <span className="animate-pulse text-[#a78bfa]">⚡</span>
        {isSingle ? "Enriching…" : `${totals.processed} done · ${remaining} remaining`}
      </div>
    );
  }

  if (isSingle) {
    const label = totals.processed > 0 ? "✓ Enriched" : totals.notRisk > 0 ? "✗ Not a risk" : "— Skipped";
    return <div className="text-sm text-[#4edea3]">{label}</div>;
  }

  return (
    <div className="text-sm text-[#4edea3]">
      ✓ {totals.processed} enriched · {totals.notRisk} not risk · {totals.skipped} skipped
    </div>
  );
}
