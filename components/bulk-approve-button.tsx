"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_TOKEN_STORAGE_KEY, getAdminHeaders } from "@/lib/admin-client";

export function BulkApproveButton({ pendingCount }: { pendingCount: number }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [approved, setApproved] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleClick() {
    const hasToken = Boolean(window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY));
    if (!hasToken) {
      setError("Admin token not set. Go to Sources and enter your admin token first.");
      setStatus("error");
      return;
    }

    setError(null);
    setStatus("loading");
    try {
      const res = await fetch("/api/admin/bulk-approve", {
        method: "POST",
        headers: getAdminHeaders()
      });

      if (!res.ok) {
        setError("Bulk approval failed. Check your admin token and retry.");
        setStatus("error");
        return;
      }

      const data = (await res.json()) as { approved: number };
      setApproved(data.approved);
      setError(null);
      setStatus("done");
      router.refresh();
    } catch {
      setError("Bulk approval failed. Please retry.");
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
    <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center">
      <button
        onClick={handleClick}
        disabled={status === "loading" || pendingCount === 0}
        className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "loading"
          ? "Approving..."
          : status === "error"
            ? "Error - retry"
            : `Approve AI ready (${pendingCount})`}
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
