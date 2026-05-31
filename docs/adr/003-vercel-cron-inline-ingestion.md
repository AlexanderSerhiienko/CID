# ADR 003: Vercel Cron Inline Ingestion

## Status

Accepted.

## Context

CID ingestion is small enough for the current portfolio scope and Vercel Hobby cadence: one scheduled run per day, plus manual admin-triggered runs when needed. The pipeline already performs URL/content-hash deduplication and wraps multi-write event creation in Prisma transactions, so repeated cron/manual runs remain safe.

Adding a separate background processor would increase deployment and operational complexity without improving the current product behavior enough to justify the extra moving parts.

## Decision

Use Vercel Cron to call `GET /api/cron/ingest` once per day. The cron route loads enabled sources and runs `ingestRssSource` directly. Manual admin ingestion continues through `POST /api/ingest/rss`.

## Consequences

- The production stack stays simple: Vercel plus Supabase.
- Ingestion failures are visible through route responses, logs, and `Source.lastError`.
- The ingestion pipeline must remain idempotent because cron and manual runs can repeat work.
- The app accepts the Vercel Hobby daily cadence limitation and communicates freshness in the UI.
- If ingestion volume grows beyond request/runtime limits, revisit the architecture with concrete scale data.
