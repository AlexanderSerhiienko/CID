"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getAdminHeaders } from "@/lib/admin-client";

export function PromoteArticleButton({ articleId }: { articleId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  async function promote() {
    setState("loading");
    try {
      const resp = await fetch("/api/admin/promote-article", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ articleId })
      });
      if (resp.ok) {
        setState("done");
        router.refresh();
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  if (state === "done") return <span className="text-[11px] text-[#4edea3]">✓ Added to queue</span>;

  return (
    <Button onClick={promote} disabled={state === "loading"} variant="secondary">
      {state === "loading" ? "Creating…" : "Create event"}
    </Button>
  );
}
