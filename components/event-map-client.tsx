"use client";

import dynamic from "next/dynamic";

export const EventMapClient = dynamic(
  () => import("@/components/event-map").then((mod) => mod.EventMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[460px] items-center justify-center rounded-md border border-border bg-card text-sm text-muted-foreground">
        Loading map...
      </div>
    )
  }
);
