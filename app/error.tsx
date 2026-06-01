"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Something went wrong</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">The dashboard hit an unexpected error.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Try again to reload this view. If the issue keeps happening, check the server logs for the error details.
        </p>
        {process.env.NODE_ENV === "development" ? (
          <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {error.message}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
