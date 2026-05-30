# Bug Hunt

Scan the CID codebase for real, concrete bugs and create GitHub Issues for each one found.

## Rules

- Only report bugs that are verifiable from the code: point to a specific file and line
- Never invent hypothetical problems — every issue must have evidence in the code
- Max 5 issues per run — prioritize by severity: **data loss > security auth bypass > silent failure > wrong output > UX/cosmetic**
- Skip anything already caught by TypeScript or ESLint
- Skip TODOs and style issues

## Skip these explicitly

- Cosmetic security hardening: `rel="noopener"`, CSP headers, `SameSite` cookies, `X-Frame-Options` — these are hygiene, not bugs
- Issues already filed: before creating any issue, check existing open GitHub issues and skip if the same root cause is already tracked

## Deduplication rule

If the same root cause appears in multiple files (e.g. NaN pagination in three different routes), file **ONE issue** that lists all affected locations. Do not file one issue per file. The title should describe the pattern, the body should list every `file:line` affected.

## What to look for

### 1. Silent failures / swallowed errors
Look in lib/pipeline/, app/api/ for:
- catch blocks that log but return a value that callers treat as success
- async functions where a thrown error would leave DB state inconsistent
- Missing error handling on external calls (RSS fetch, Prisma queries outside transactions)

### 2. Data integrity issues
- Multi-step DB writes that are NOT wrapped in a Prisma transaction but should be
- Places where a partial write could leave orphaned records
- Deduplication logic that could produce duplicate records under concurrent requests

### 3. Logic bugs
- Off-by-one in scoring thresholds
- Similarity/dedup conditions that are too broad or too narrow
- Pipeline steps that mutate shared state across requests

### 4. Missing validation at API boundaries
Look in app/api/ for routes that:
- Accept a request body but do not validate with Zod before using it
- Do not check admin auth on mutation endpoints

### 5. Test gaps for critical paths
Only flag if the gap is in a critical path (pipeline, dedup, scoring, merge) and the missing case is a real edge case (empty input, concurrent duplicate, DB error).

## Process

1. Read these files first:
   - lib/pipeline/rss.ts
   - lib/pipeline/extraction.ts
   - lib/pipeline/scoring.ts
   - lib/pipeline/deduplication.ts
   - lib/review/merge.ts
   - app/api/ingest/rss/route.ts
   - app/api/admin/review/route.ts

2. For each real bug found, collect:
   - File and line number (exact)
   - What the code does (current behavior)
   - Why it is a bug (what goes wrong and when)
   - Suggested fix (concrete)
   - Severity: critical / high / medium

3. Rank by severity, keep top 5.

4. For each finding, create a GitHub Issue on AlexanderSerhiienko/CID:
   - Title: [bug] short description
   - Labels: bug + severity label — create labels if they do not exist
   - Body sections: What's wrong / Where (file:line) / When it happens / Suggested fix

5. Add each issue to the "CID Bug Tracker" GitHub Project under column Backlog.

6. Report summary: list each issue title + URL + severity. End with total count.
