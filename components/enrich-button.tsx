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

export function EnrichButton({ pendingCount }: { pendingCount: number }) {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [totals, setTotals] = useState({ processed: 0, notRisk: 0, skipped: 0 });
  const [remaining, setRemaining] = useState(pendingCount);

  async function runEnrichment() {
    setState("running");
    let rem = remaining;
    const acc = { processed: 0, notRisk: 0, skipped: 0 };

    while (rem > 0) {
      
      const resp = await fetch("/api/admin/enrich", {
        method: "POST",
        headers: { ...getAdminHeaders() }
      });
      if (!resp.ok) break;
      const result: EnrichResult = await resp.json();
      acc.processed += result.processed;
      acc.notRisk += result.notRisk;
      acc.skipped += result.skipped;
      rem = result.remaining;
      setTotals({ ...acc });
      setRemaining(rem);
      // Wait 3s between batches so the Groq rate limit is respected
      // across serverless invocations (module state resets per container).
      if (rem > 0) await new Promise((r) => setTimeout(r, 3_000));
    }

    setState("done");
  }

  if (state === "idle") {
    return (
      <Button onClick={runEnrichment} variant="secondary" >
        ✨ Enrich {remaining} with AI
      </Button>
    );
  }

  if (state === "running") {
    return (
      <div className="flex items-center gap-3 text-sm text-[#c2c6d6]">
        <span className="animate-pulse text-[#a78bfa]">⚡ Enriching…</span>
        <span>{totals.processed} done · {remaining} remaining</span>
      </div>
    );
  }

  return (
    <div className="text-sm text-[#4edea3]">
      ✓ Done — {totals.processed} enriched · {totals.notRisk} not risk · {totals.skipped} skipped
    </div>
  );
}
