"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_TOKEN_STORAGE_KEY, getAdminHeaders } from "@/lib/admin-client";

export function BulkApproveButton({ pendingCount }: { pendingCount: number }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [approved, setApproved] = useState(0);
  const router = useRouter();

  async function handleClick() {
    const hasToken = Boolean(window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY));
    if (!hasToken) {
      alert("Admin token not set. Go to Sources and enter your admin token first.");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/admin/bulk-approve", {
        method: "POST",
        headers: getAdminHeaders()
      });

      if (!res.ok) {
        setStatus("error");
        return;
      }

      const data = (await res.json()) as { approved: number };
      setApproved(data.approved);
      setStatus("done");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <span className="text-sm text-green-600 dark:text-green-400">
        ✓ Approved {approved} event{approved === 1 ? "" : "s"}
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === "loading" || pendingCount === 0}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      {status === "loading"
        ? "Approving..."
        : status === "error"
          ? "Error — retry"
          : `Approve AI ready (${pendingCount})`}
    </button>
  );
}
