# RSS Failure Playbook

## Purpose

Use this playbook when RSS ingestion fails, creates duplicates, or stops producing candidate risk events.

## Checks

1. Confirm the source is enabled.
2. Open the source URL and verify it returns RSS or Atom XML.
3. Check whether the feed returns an HTML error page.
4. Inspect Vercel Cron or local server logs for parser errors, timeouts, or database constraint failures.
5. Confirm PostgreSQL is reachable.
6. Look for duplicate URL or content hash constraint errors.
7. If Groq extraction is enabled, check whether it timed out or returned invalid JSON.

## Common Causes

- Source changed feed URL.
- Feed is temporarily unavailable.
- Feed contains malformed XML.
- Ingestion was manually re-run after a partial failure.
- Database uniqueness constraints are missing or too weak.
- AI extraction returned invalid output and fallback was not handled.

## Resolution Steps

- Disable the source if it repeatedly fails.
- Re-run ingestion after confirming idempotency.
- Keep `source.lastError` visible and disable repeatedly failing sources until fixed.
- Add a regression test for the failing feed shape.
- Update source configuration if the feed URL changed.

## Prevention

- Use request timeouts.
- Enforce URL and content hash uniqueness.
- Keep ingestion idempotent so cron/manual re-runs are safe.
- Validate all AI output with a schema.
- Send uncertain events to review instead of publishing automatically.
