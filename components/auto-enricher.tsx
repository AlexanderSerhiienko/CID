"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getAdminHeaders } from "@/lib/admin-client";

type ProcessNextResult = {
  done: boolean;
  kind: "article" | "event" | "none";
  remaining: number;
};

/**
 * Invisible background component — drives the enrichment queue automatically.
 * Calls POST /api/admin/process-next in a loop (one item per 5s) until done.
 * Handles both pending RawArticles (→ creates RiskEvents) and unenriched events.
 * Refreshes the page after each item so stats and cards update in real time.
 */
export function AutoEnricher() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      while (true) {
        let result: ProcessNextResult;
        try {
          const resp = await fetch("/api/admin/process-next", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAdminHeaders() }
          });
          if (!resp.ok) break;
          result = await resp.json() as ProcessNextResult;
        } catch {
          break;
        }

        router.refresh();
        if (result.done) break;

        // 5s between calls keeps client-triggered enrichment comfortably below Groq rate limits.
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }

    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
