# Crisis Intelligence Dashboard — Project Context

## How to Work on This Project

This is an AI-native project. That means AI is not just used to write code — it follows a structured workflow for every task.

### For every new feature or task:

**Step 1 — Plan first (always)**
Before writing any code, read `agents/planner.md` and produce a plan. Output the plan as a numbered list of steps. Do not start implementing until the plan is clear.

**Step 2 — Implement**
Follow `agents/coder.md` conventions. Work step by step through the plan. One concern per commit.

**Step 3 — Self-review**
After implementation, read `agents/reviewer.md` and go through the checklist yourself. Fix any blocking issues before considering the task done.

**Step 4 — Tests**
Follow `agents/testing.md`. Every non-trivial change to `lib/` needs at least one new test. Run `npm run test` before finishing.

**Step 5 — Verify**
Run `npm run typecheck && npm run lint && npm run test`. All must pass.

### For refactoring:
Read `agents/refactor.md` first. Never mix refactor with feature work.

### For DevOps / infrastructure tasks:
Read `agents/devops.md` first.

### Rules
- Never skip the planning step for anything larger than a one-line fix
- Never mark a task done if tests are failing
- Never add a runtime dependency on an external paid AI API
- Pipeline changes (lib/pipeline/) always need tests
- Never add "Co-Authored-By" lines to commit messages

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
- **Queue:** BullMQ + Redis (ioredis)
- **UI:** Tailwind CSS + shadcn/ui + Leaflet (choropleth risk map)
- **Validation:** Zod
- **Tests:** Vitest
- **Infrastructure:** Docker Compose, GitHub Actions CI
- **Optional AI extraction:** Ollama (local, not required)

---

## Key Commands

```bash
# Development
npm run dev                        # Start Next.js dev server
npm run worker:ingest              # Start BullMQ ingestion worker (separate terminal)

# Database
docker compose up -d               # Start PostgreSQL + Redis
npx prisma migrate dev             # Run migrations
npm run prisma:seed                # Seed 10 official/open-data sources

# Quality
npm run typecheck                  # tsc --noEmit
npm run test                       # vitest run
npm run lint                       # eslint
npm run build                      # production build

# Backfill scripts (run after rule changes)
npm run events:backfill-locations  # Re-extract locations for existing events
npm run events:backfill-statuses   # Re-apply auto-publish rules
npm run events:backfill-from-raw   # Reprocess raw articles with updated extraction
npm run events:demote-low-auto-published  # Move low-severity events back to review
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
  queue.ts              # BullMQ queue setup
  utils.ts

workers/
  ingest-worker.ts      # BullMQ worker — processes ingestion jobs

components/             # React components (shadcn/ui based)
prisma/
  schema.prisma         # Source, RawArticle, RiskEvent models
  seed.ts               # 10 pre-configured sources
scripts/                # One-off backfill scripts
docs/adr/               # Architecture Decision Records
agents/                 # AI agent role definitions (see below)
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
- **No AI runtime dependency** — all pipeline logic must work without Ollama
- **Co-located tests** — `*.test.ts` next to the file being tested, use Vitest
- **Server components by default** — only add `'use client'` when actually needed

---

## What's Implemented

- Full ingestion pipeline (RSS → RawArticle → extraction → scoring → dedup → review)
- Source CRUD with trust score editing and enable/disable
- Review queue with approve/reject/edit/merge
- Ranked merge suggestions with reason text
- Dashboard with Leaflet choropleth risk map (green/yellow/red by country)
- Events table with filtering and detail pages
- BullMQ queue + worker for async ingestion
- Docker Compose (PostgreSQL on port 5433, Redis)
- GitHub Actions CI (typecheck + test + lint + build)
- Vitest unit tests for extraction, scoring, deduplication, merge, validation, admin auth

## What's Not Implemented Yet

See **`ROADMAP.md`** for detailed specs on each of these.

- Ollama extraction (documented in ADR 002, fallback rules exist) — **next priority**
- MCP integration (GitHub MCP + PostgreSQL MCP + custom CID MCP server) — **next priority**
- Deployment (Vercel + Supabase) — **next priority**
- Full geocoder (country-level only, not city coordinates)
- Full user/session auth (only lightweight admin token)
- Live database integration tests

---

## Runtime AI Policy

The application must work without external paid AI APIs.

Optional Ollama extraction flow (not yet implemented):
```
rawText → deterministic rules → [optional Ollama] → Zod validation → fallback to rules → RiskEvent
```
- Ollama must be gated by timeout
- Output must pass schema validation before use
- Deterministic rules are always the fallback

---

## Architecture Decision Records

- `docs/adr/001` — AI-Assisted Engineering Workflow
- `docs/adr/002` — Hybrid Extraction: Rules Before Ollama
- `docs/adr/003` — BullMQ For Ingestion Jobs
- `docs/adr/004` — First Vertical Slice Before Feature Expansion

---

## Agent Roles

See `agents/` directory for role-specific instructions:
- `agents/planner.md` — task decomposition and feature planning
- `agents/coder.md` — implementation conventions
- `agents/reviewer.md` — code review checklist
- `agents/testing.md` — test strategy and edge cases
- `agents/refactor.md` — cleanup and optimization
- `agents/devops.md` — Docker, CI/CD, deployment
