"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getAdminHeaders } from "@/lib/admin-client";

/**
 * Invisible component — auto-enriches unenriched events in the review queue
 * one by one (2.1s apart) so the reviewer just needs to approve or reject.
 */
export function AutoEnricher({ eventIds }: { eventIds: string[] }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || eventIds.length === 0) return;
    started.current = true;

    async function run() {
      for (const eventId of eventIds) {
        await fetch("/api/admin/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAdminHeaders() },
          body: JSON.stringify({ eventId })
        }).catch(() => {}); // silent — network errors don't break the loop
        router.refresh();
        await new Promise((r) => setTimeout(r, 2_100));
      }
    }

    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
