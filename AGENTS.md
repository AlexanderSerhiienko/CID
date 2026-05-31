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
- **Database:** PostgreSQL + Prisma ORM
- **Scheduled ingestion:** Vercel Cron + in-process ingest queue (`lib/pipeline/ingest-queue.ts`)
- **UI:** Tailwind CSS + shadcn/ui + Leaflet (choropleth risk map)
- **Validation:** Zod
- **Tests:** Vitest
- **Infrastructure:** Docker Compose, GitHub Actions CI
- **Optional AI extraction:** Groq (gated with timeout and fallback)

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
    sources/            # GET/POST /api/sources
    ingest/rss/         # POST /api/ingest/rss  (admin-protected)
    admin/review/       # POST /api/admin/review (admin-protected)
  admin/review/         # Review queue UI
  events/               # Events table + detail pages
  sources/              # Source management UI
  page.tsx              # Dashboard (map + event list)

lib/
  pipeline/
    rss.ts              # RSS feed fetching and parsing
    extraction.ts       # Deterministic field extraction from raw text
    scoring.ts          # Severity + confidence scoring rules
    deduplication.ts    # URL hash + content hash + similarity dedup
    hash.ts             # Content hashing utilities
    similarity.ts       # Title/location similarity scoring
  review/
    merge.ts            # Merge duplicate events
    merge-suggestions.ts # Ranked merge candidate suggestions
  auth/
    admin.ts            # Admin token validation
    constants.ts
  map/
    risk-scale.ts       # Country risk level aggregation for choropleth
  db.ts                 # Prisma client singleton
  utils.ts

components/             # React components (shadcn/ui based)
prisma/
  schema.prisma         # Source, RawArticle, RiskEvent models
  seed.ts               # 10 pre-configured sources
docs/adr/               # Architecture Decision Records
```

---

## Data Models

**Source** — RSS/open-data feed with trust score and enable/disable toggle

**RawArticle** — Raw ingested article with content hash for deduplication

**RiskEvent** — Normalized, scored event with status lifecycle:
- `DRAFT` → `NEEDS_REVIEW` → `PUBLISHED` or `REJECTED`
- Auto-published when: confidence ≥ 0.7 AND location resolved AND severity ≥ HIGH
- Otherwise goes to human review queue

**Event categories:** DISEASE_OUTBREAK, NATURAL_DISASTER, CYBER_ATTACK, TRANSPORT_DISRUPTION, POLITICAL_UNREST, FOOD_SAFETY_ALERT

---

## Pipeline Details

### Ingestion (`POST /api/ingest/rss`)
1. Fetch enabled sources
2. Parse RSS feeds
3. Deduplicate by URL and content hash
4. Extract fields (category, location, severity, confidence) via deterministic rules
5. Score event (severity × source trust score → confidence)
6. Check similarity against existing events — merge evidence or create candidate
7. Auto-publish high-confidence events; rest go to `NEEDS_REVIEW`

### Review Queue (`/admin/review`)
- Approve / reject candidates
- Edit fields before approval
- Merge duplicate candidates into an existing published event
- Ranked merge suggestions shown automatically

### Admin Auth
- Lightweight `x-admin-token` header on mutation routes
- Token stored in browser localStorage via admin-client
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
- Source CRUD with trust score editing and enable/disable
- Review queue with approve/reject/edit/merge
- Ranked merge suggestions with reason text
- Dashboard with Leaflet choropleth risk map (green/yellow/red by country)
- Events table with filtering and detail pages
- Vercel Cron + admin endpoint for scheduled/manual ingestion
- In-process ingest queue (`lib/pipeline/ingest-queue.ts`) — serializes sources without external infrastructure
- Docker Compose (PostgreSQL on port 5433)
- GitHub Actions CI (typecheck + test + lint + build)
- Vitest unit tests for extraction, scoring, deduplication, merge, validation, admin auth

## What's Not Implemented Yet

See **`ROADMAP.md`** for detailed specs on each of these.

- Groq extraction (documented in ADR 002, fallback rules exist) — **next priority**
- MCP integration (GitHub MCP + PostgreSQL MCP + custom CID MCP server) — **next priority**
- Deployment (Vercel + Supabase) — **next priority**
- Full geocoder (country-level only, not city coordinates)
- Full user/session auth (only lightweight admin token)
- Live database integration tests

---

## Runtime AI Policy

The application must work without external paid AI APIs.

Groq extraction flow:
```
rawText → deterministic rules → [optional Groq] → Zod validation → fallback to rules → RiskEvent
```
- Groq must be gated by timeout
- Output must pass schema validation before use
- Deterministic rules are always the fallback

---

## Architecture Decision Records

- `docs/adr/001` — AI-Assisted Engineering Workflow
- `docs/adr/002` — Hybrid Extraction: Rules Before Groq
- `docs/adr/003` — Vercel Cron Inline Ingestion
- `docs/adr/004` — First Vertical Slice Before Feature Expansion

---

## AI Workflow Automation

### Slash Commands (`.Codex/commands/`)

| Command | When to use |
|---------|-------------|
| `/decompose-issue <N>` | Before starting any non-trivial issue — fetches it and produces a plan |
| `/issue-fix` | Picks the next ready-to-fix issue and implements it end-to-end |
| `/bug-hunt` | Scans codebase for real bugs and files GitHub issues |
| `/gen-pr-desc` | Generates PR title + body from current branch diff |
| `/changelog` | Generates CHANGELOG entry from git log since last tag |
| `/code-review` | Reviews current diff before opening a PR |
| `/simplify` | Cleans up changed code after a feature lands |

### Automated Hooks (`.Codex/settings.json`)

| Trigger | What happens |
|---------|-------------|
| Any `Write`/`Edit` to `lib/` | Warns if no corresponding `*.test.ts` exists |
| `git push` | Blocks push if `typecheck`, `lint`, or `test` fail |
