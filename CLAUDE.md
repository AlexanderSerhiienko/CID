# Crisis Intelligence Dashboard — Project Context

## How to Work on This Project

### For every new feature or task:

**Step 1 — Plan first**
For anything larger than a one-line fix, produce a plan before writing code:

```
## Feature: [name]

### What it does
[one sentence]

### Layers affected
- [ ] schema.prisma
- [ ] lib/pipeline/
- [ ] app/api/
- [ ] app/ (UI)
- [ ] scheduled ingestion
- [ ] tests

### Implementation steps
1. ...

### Tests needed
- ...

### Risks / edge cases
- ...
```

Flag anything that touches deduplication or scoring — these are fragile. Plan migrations as a separate step before implementation.

**Step 2 — Implement**
Work step by step through the plan. One concern per commit.

**Step 3 — Self-review**
Before considering done, check these blocking issues:
- All mutation API routes protected by admin token?
- All request bodies validated with Zod before touching DB?
- Multi-step DB writes wrapped in Prisma transactions?
- External HTTP calls (RSS fetches) have timeouts?
- No errors silently swallowed — log or rethrow?
- New `schema.prisma` fields have a migration?
- No N+1 queries — use `include` or batch fetches?

**Step 4 — Tests**
Every non-trivial change to `lib/` needs at least one new test. Run `npm run test` before finishing.

**Step 5 — Verify**
`npm run typecheck && npm run lint && npm run test` — all must pass.

### Rules
- Never skip the planning step for anything larger than a one-line fix
- Never mark a task done if tests are failing
- Never add a runtime dependency on an external paid AI API
- Pipeline changes (`lib/pipeline/`) always need tests
- Never mix refactor with feature work
- Never add "Co-Authored-By" lines to commit messages
- Before opening a PR, run `/code-review`

---

## What This Is

A fullstack ingestion pipeline that turns raw RSS and open-data sources into reviewed, structured risk events.

```
Source → RawArticle → Extraction → Normalization → Deduplication → Scoring → Review → Published RiskEvent
```

This is a portfolio project demonstrating fullstack engineering + AI-native development workflow.

---

## Stack

- **Framework:** Next.js 15 App Router, React 19, TypeScript
- **Database:** PostgreSQL + Prisma ORM (local: Docker on host port 5433; production: Supabase — pooled `DATABASE_URL` on 6543, direct `DIRECT_URL` on 5432 for migrations)
- **Scheduled ingestion:** Vercel Cron + in-process ingest queue (`lib/pipeline/ingest-queue.ts`)
- **UI:** Tailwind CSS + shadcn/ui + Leaflet (choropleth risk map)
- **Validation:** Zod
- **Tests:** Vitest
- **Infrastructure:** Docker Compose (PostgreSQL only), GitHub Actions CI, deployed on Vercel + Supabase
- **AI extraction & enrichment:** Groq (optional — gated with timeout; deterministic rules always run as the baseline)
- **Geocoding:** Nominatim (optional, rate-limited, timeout-gated)
- **MCP:** custom CID MCP server (`mcp/server.ts`)

---

## Key Commands

```bash
# Development
npm run dev                        # Start Next.js dev server

# Database
docker compose up -d               # Start PostgreSQL
npx prisma migrate dev             # Run migrations
npm run prisma:seed                # Seed 10 official/open-data sources

# Quality
npm run typecheck                  # tsc --noEmit
npm run test                       # vitest run
npm run lint                       # eslint
npm run build                      # production build

```

---

## Project Structure

```
app/                    # Next.js App Router pages and API routes
  api/
    events/             # GET /api/events, GET /api/events/[id]
    events/feed/        # GET /api/events/feed (JSON feed)
    sources/            # GET (admin) + POST /api/sources, PATCH /api/sources/[id]
    ingest/rss/         # POST /api/ingest/rss              (admin)
    cron/ingest/        # GET  /api/cron/ingest             (CRON_SECRET — Vercel Cron)
    admin/
      review/           # GET + PATCH /api/admin/review     (admin)
      bulk-approve/     # POST                               (admin)
      enrich/           # POST — batch/single AI enrichment  (admin)
      process-next/     # POST — enrich one queued item      (admin)
      promote-article/  # POST — promote AI-rejected article (admin)
      ingest-continue/  # POST — cron continuation           (CRON_SECRET)
    health/             # GET /api/health
  admin/review/         # Review queue UI (server-gated by admin cookie)
  events/               # Events table + detail pages
  sources/              # Source management UI
  page.tsx              # Dashboard (map + event list)

lib/
  pipeline/
    rss.ts              # RSS fetching, parsing, dedup + create (transactional)
    extraction.ts       # Deterministic field extraction from raw text
    ai-extraction.ts    # Optional Groq extraction (timeout + rate limit + Zod)
    ai-enrichment.ts    # Enrich queued RawArticles / existing events via Groq
    scoring.ts          # Severity + confidence scoring rules
    deduplication.ts    # URL hash + content hash + similarity dedup
    similarity.ts       # Title/summary Jaccard similarity
    hash.ts             # Content hashing utilities
    geocoder.ts         # Nominatim geocoding (rate-limited, timeout)
    ingest-queue.ts     # In-process serialized ingest queue
    timed-ingest.ts     # Time-limited ingestion + cron continuation URL
  review/
    merge.ts            # Merge duplicate events (transactional)
    merge-suggestions.ts # Ranked merge candidate suggestions
  auth/
    admin.ts            # Admin token validation (x-admin-token / cookie)
    cron.ts             # CRON_SECRET validation for cron routes
    constants.ts        # Header + cookie names
  validation/
    source.ts           # Zod schemas + SSRF-safe URL allowlist for Source CRUD
  map/
    risk-scale.ts       # Country risk aggregation for choropleth
    country-centroids.ts # Country → lat/lon centroids
  admin-client.ts       # Client token storage (localStorage + cookie) + fetch headers
  db.ts                 # Prisma client singleton
  utils.ts

components/             # React components (shadcn/ui based)
mcp/
  server.ts             # Custom CID MCP server (6 tools over stdio)
prisma/
  schema.prisma         # Source, RawArticle, RiskEvent models
  migrations/           # SQL migrations
  seed.ts               # 10 pre-configured sources
```

---

## Data Models

**Source** — RSS/open-data feed with trust score and enable/disable toggle

**RawArticle** — Raw ingested article with content hash for deduplication.
- `aiPending` — `true` once ingested and queued for Groq enrichment
- `aiRejected` — `true` when Groq judged it not a risk event; available for human override via promote-article

**RiskEvent** — Normalized, scored event with status lifecycle:
- `NEEDS_REVIEW` → `PUBLISHED` or `REJECTED`
- Every ingested event goes to `NEEDS_REVIEW`. There is **no auto-publish** — human review is required for all events (intentional design; `DRAFT` was removed from the enum).

**Event categories:** DISEASE_OUTBREAK, NATURAL_DISASTER, CYBER_ATTACK, TRANSPORT_DISRUPTION, POLITICAL_UNREST, FOOD_SAFETY_ALERT, UNKNOWN

---

## Pipeline Details

### Ingestion (`POST /api/ingest/rss`, `GET /api/cron/ingest`)
1. Fetch enabled sources
2. Parse RSS feeds (fetch is timeout-gated)
3. Deduplicate by URL and content hash
4. Extract fields (category, location, severity, confidence) via deterministic rules
5. Score event (severity × source trust score → confidence)
6. Check similarity against recent events — link evidence (transactional) or create a candidate
7. New candidates are saved as `NEEDS_REVIEW`; non-GeoRSS articles are queued (`aiPending`) for AI enrichment. No event is auto-published.

### Review Queue (`/admin/review`)
- Approve / reject candidates
- Edit fields before approval
- Merge duplicate candidates into an existing published event
- Ranked merge suggestions shown automatically

### Admin Auth
- Lightweight `x-admin-token` header on mutation API routes (`requireAdmin`)
- `CRON_SECRET` bearer token on cron routes (`/api/cron/ingest`, `/api/admin/ingest-continue`)
- Token stored client-side in both localStorage (for the header) and a cookie (for server-side checks)
- `/admin/review` is gated server-side via the cookie before any DB query runs
- Dev passthrough: when `ADMIN_TOKEN` is unset and `NODE_ENV=development`, admin checks pass
- Not a full session system — intentional for MVP simplicity

---

## Coding Conventions

- **TypeScript strict** — no `any`, always explicit return types on exported functions
- **Zod validation** at API boundaries — validate request body before touching DB
- **Prisma transactions** for multi-step writes (merge operations)
- **Error responses** — always `{ error: string }` JSON with appropriate HTTP status
- **Groq is optional** — all pipeline logic must work without it; deterministic rules are always the fallback
- **Co-located tests** — `*.test.ts` next to the file being tested, use Vitest
- **Server components by default** — only add `'use client'` when actually needed
- **Business logic in `lib/`** — never put logic inside API route handlers
- **No N+1 queries** — use Prisma `include` or batch with `findMany({ where: { id: { in: [...] } } })`
- **Scheduled ingestion** uses the in-process `enqueueIngest` queue, must remain idempotent, and external RSS fetches must have a timeout

### Test priorities
1. Pipeline logic — extraction, scoring, deduplication (pure functions, easy to test)
2. API route contracts — status codes, admin token enforcement, response shape
3. Review logic — merge, merge-suggestions
4. Edge cases to always cover: empty input, `country: null`, ambiguous category → `UNKNOWN`, duplicate merge attempt

### Refactor rules
- Run tests before and after — if tests break, the refactor is wrong
- One concern per PR — don't mix refactor with feature work
- Keep pipeline steps pure — `lib/pipeline/` must not import from `app/`

---

## What's Implemented

- Full ingestion pipeline (RSS → RawArticle → extraction → scoring → dedup → review)
- Optional Groq AI extraction + enrichment (`ai-extraction.ts`, `ai-enrichment.ts`) — timeout-gated, Zod-validated, with the deterministic rules as baseline
- Nominatim geocoding (`geocoder.ts`) — country + city coordinates, rate-limited and timeout-gated
- Source CRUD with trust score editing and enable/disable
- Review queue with approve/reject/edit/merge, gated server-side by the admin cookie
- Ranked merge suggestions with reason text
- Dashboard with Leaflet choropleth risk map (green/yellow/red by country)
- Events table with filtering and detail pages
- Vercel Cron + admin endpoint for scheduled/manual ingestion (`CRON_SECRET`)
- In-process ingest queue (`lib/pipeline/ingest-queue.ts`) — serializes sources without external infrastructure
- Custom CID MCP server (`mcp/server.ts`) — 6 tools over stdio
- Deployed on Vercel + Supabase
- Docker Compose for local PostgreSQL (host port 5433)
- GitHub Actions CI (typecheck + test + lint + build)
- Vitest unit tests for extraction, scoring, deduplication, similarity, merge, validation, admin/cron auth, and API route contracts

## What's Not Implemented Yet

See **`ROADMAP.md`** for detailed specs.

- Full user/session auth (only the lightweight admin token + cookie)
- Live database integration tests (current tests mock Prisma)
- GitHub / PostgreSQL MCP integrations (only the custom CID MCP server exists)

---

## Runtime AI Policy

The application must work without external paid AI APIs.

Groq enrichment flow:
```
rawText → deterministic rules (baseline RiskEvent) → [optional Groq, timeout-gated] → Zod validation
```
- Groq is gated by a timeout; if it is unavailable the article stays `aiPending` for retry
- If Groq permanently fails or returns invalid output, the deterministic baseline stands
- If Groq judges the article not a risk event, it is marked `aiRejected` for human override
- Groq output must pass Zod validation before it is applied
- Deterministic rules always produce a usable baseline without Groq

---

---

## AI Workflow Automation

### Slash Commands (`.claude/commands/`)

| Command | When to use |
|---------|-------------|
| `/decompose-issue <N>` | Before starting any non-trivial issue — fetches it and produces a plan |
| `/issue-fix` | Picks the next ready-to-fix issue and implements it end-to-end |
| `/bug-hunt` | Scans codebase for real bugs and files GitHub issues |
| `/gen-pr-desc` | Generates PR title + body from current branch diff |
| `/changelog` | Generates CHANGELOG entry from git log since last tag |
| `/code-review` | Reviews current diff before opening a PR |
| `/simplify` | Cleans up changed code after a feature lands |

### Automated Hooks (`.claude/settings.json`)

| Trigger | What happens |
|---------|-------------|
| Any `Write`/`Edit` to `lib/` | Warns if no corresponding `*.test.ts` exists |
| `git push` | Blocks push if `typecheck`, `lint`, or `test` fail |
