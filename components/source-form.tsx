"use client";

import { SourceType } from "@prisma/client";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getAdminHeaders, parseMutationResponse } from "@/lib/admin-client";

export function SourceForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setError(null);
    try {
      const response = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({
          name: formData.get("name"),
          url: formData.get("url"),
          type: formData.get("type"),
          enabled: true,
          trustScore: Number(formData.get("trustScore"))
        })
      });
      const result = await parseMutationResponse(response);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    }
  }

  return (
    <form action={submit} className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-[1fr_1.4fr_160px_130px_auto]">
      <input
        name="name"
        required
        placeholder="Source name"
        className="h-10 rounded-md border border-border bg-background px-3 text-sm"
      />
      <input
        name="url"
        required
        type="url"
        placeholder="https://example.com/feed.xml"
        className="h-10 rounded-md border border-border bg-background px-3 text-sm"
      />
      <select
        name="type"
        defaultValue={SourceType.RSS}
        className="h-10 rounded-md border border-border bg-background px-3 text-sm"
      >
        {Object.values(SourceType).map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <input
        name="trustScore"
        type="number"
        min="0"
        max="1"
        step="0.05"
        defaultValue="0.5"
        className="h-10 rounded-md border border-border bg-background px-3 text-sm"
      />
      <Button>
        <Plus className="mr-2 h-4 w-4" />
        Add
      </Button>
      {error ? <p className="text-sm text-destructive md:col-span-5">{error}</p> : null}
    </form>
  );
}
