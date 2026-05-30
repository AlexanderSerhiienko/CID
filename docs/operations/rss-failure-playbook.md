# RSS Failure Playbook

## Purpose

Use this playbook when RSS ingestion fails, creates duplicates, or stops producing candidate risk events.

## Checks

1. Confirm the source is enabled.
2. Open the source URL and verify it returns RSS or Atom XML.
3. Check whether the feed returns an HTML error page.
4. Inspect worker logs for parser errors, timeouts, or database constraint failures.
5. Check Redis connectivity.
6. Check BullMQ failed jobs and retry count.
7. Confirm PostgreSQL is reachable.
8. Look for duplicate URL or content hash constraint errors.
9. If Groq extraction is enabled, check whether it timed out or returned invalid JSON.

## Common Causes

- Source changed feed URL.
- Feed is temporarily unavailable.
- Feed contains malformed XML.
- Worker retried after a partial write.
- Database uniqueness constraints are missing or too weak.
- AI extraction returned invalid output and fallback was not handled.

## Resolution Steps

- Disable the source if it repeatedly fails.
- Re-run ingestion after confirming idempotency.
- Move repeated failures to a dead-letter queue.
- Add a regression test for the failing feed shape.
- Update source configuration if the feed URL changed.

## Prevention

- Use request timeouts.
- Enforce URL and content hash uniqueness.
- Keep ingestion workers idempotent.
- Validate all AI output with a schema.
- Send uncertain events to review instead of publishing automatically.

