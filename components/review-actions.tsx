"use client";

import { EventCategory, EventStatus, Severity } from "@prisma/client";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getAdminHeaders, parseMutationResponse } from "@/lib/admin-client";

type ReviewEvent = {
  id: string;
  title: string;
  summary: string;
  category: EventCategory;
  severity: Severity;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  locationConfidence: number;
  aiEnhanced: boolean;
};

type MergeTarget = {
  id: string;
  title: string;
  status: EventStatus;
  country: string | null;
  city: string | null;
  score: number;
  reasons: string[];
};

export function ReviewActions({
  event,
  mergeTargets
}: {
  event: ReviewEvent;
  mergeTargets: MergeTarget[];
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligibleMergeTargets = mergeTargets.filter((target) => target.id !== event.id);

  async function submit(action: "approve" | "reject", formData?: FormData) {
    setIsLoading(true);
    setError(null);

    const patch = formData
      ? {
          title: String(formData.get("title") ?? ""),
          summary: String(formData.get("summary") ?? ""),
          category: String(formData.get("category") ?? event.category),
          severity: String(formData.get("severity") ?? event.severity),
          country: nullableString(formData.get("country")),
          city: nullableString(formData.get("city")),
          latitude: nullableNumber(formData.get("latitude")),
          longitude: nullableNumber(formData.get("longitude")),
          locationConfidence: Number(formData.get("locationConfidence") ?? event.locationConfidence)
        }
      : undefined;

    try {
      const response = await fetch("/api/admin/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ id: event.id, action, patch })
      });
      const result = await parseMutationResponse(response);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function merge(formData: FormData) {
    setIsLoading(true);
    setError(null);

    const targetEventId = String(formData.get("targetEventId") ?? "");
    try {
      const response = await fetch("/api/admin/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({ id: event.id, action: "merge", targetEventId })
      });
      const result = await parseMutationResponse(response);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isMerging) {
    return (
      <form
        className="mt-4 grid gap-3 rounded-md border border-border bg-background p-3"
        action={merge}
      >
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Merge into event</span>
          <select
            name="targetEventId"
            required
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            {eligibleMergeTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {Math.round(target.score * 100)}% · {target.title} · {target.status}
                {[target.city, target.country].filter(Boolean).length
                  ? ` · ${[target.city, target.country].filter(Boolean).join(", ")}`
                  : ""}
              </option>
            ))}
          </select>
        </label>
        {eligibleMergeTargets[0] ? (
          <p className="text-xs text-muted-foreground">
            Top match: {eligibleMergeTargets[0].reasons.join(", ")}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button disabled={isLoading || eligibleMergeTargets.length === 0}>Merge</Button>
          <Button type="button" variant="secondary" onClick={() => setIsMerging(false)}>
            Cancel
          </Button>
        </div>
        {eligibleMergeTargets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No eligible target events yet.</p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>
    );
  }

  if (isEditing) {
    return (
      <form
        className="mt-4 grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-2"
        action={(formData) => submit("approve", formData)}
      >
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs text-muted-foreground">Title</span>
          <input
            name="title"
            defaultValue={event.title}
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs text-muted-foreground">Summary</span>
          <textarea
            name="summary"
            defaultValue={event.summary}
            rows={3}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Category</span>
          <select
            name="category"
            defaultValue={event.category}
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            {Object.values(EventCategory).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Severity</span>
          <select
            name="severity"
            defaultValue={event.severity}
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            {Object.values(Severity).map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Country</span>
          <input
            name="country"
            defaultValue={event.country ?? ""}
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">City</span>
          <input
            name="city"
            defaultValue={event.city ?? ""}
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Latitude</span>
          <input
            name="latitude"
            type="number"
            step="0.0001"
            defaultValue={event.latitude ?? ""}
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Longitude</span>
          <input
            name="longitude"
            type="number"
            step="0.0001"
            defaultValue={event.longitude ?? ""}
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Location confidence</span>
          <input
            name="locationConfidence"
            type="number"
            min="0"
            max="1"
            step="0.05"
            defaultValue={event.locationConfidence}
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
          />
        </label>
        <div className="flex items-end gap-2">
          <Button disabled={isLoading}>
            <Check className="mr-2 h-4 w-4" />
            Save approve
          </Button>
          <Button type="button" variant="secondary" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => submit("approve")} disabled={isLoading}>
        <Check className="mr-2 h-4 w-4" />
        Approve
      </Button>
      <Button onClick={() => submit("reject")} disabled={isLoading} variant="destructive">
        <X className="mr-2 h-4 w-4" />
        Reject
      </Button>
      <Button onClick={() => setIsEditing(true)} disabled={isLoading} variant="secondary">
        Edit
      </Button>
      <Button onClick={() => setIsMerging(true)} disabled={isLoading} variant="secondary">
        Merge
      </Button>
      {error ? <p className="basis-full text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function nullableString(value: FormDataEntryValue | null) {
  const stringValue = String(value ?? "").trim();
  return stringValue.length > 0 ? stringValue : null;
}

function nullableNumber(value: FormDataEntryValue | null) {
  const stringValue = String(value ?? "").trim();
  return stringValue.length > 0 ? Number(stringValue) : null;
}
