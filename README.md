# Crisis Intelligence Dashboard

A fullstack crisis intelligence project that turns raw RSS and open-data sources into reviewed, structured risk events.

The product goal is to demonstrate a realistic ingestion pipeline:

```text
Source -> RawArticle -> Extraction -> Normalization -> Deduplication -> Scoring -> Review -> Published RiskEvent
```

## Current Status

Full pipeline is implemented and deployed. The project runs in production on Vercel + Supabase + Upstash Redis with a daily Vercel Cron job triggering ingestion.

Implemented:

- Next.js App Router application structure
- Prisma schema for `Source`, `RawArticle`, and `RiskEvent`
- Source management page and API with `lastIngestedAt` and `lastError` tracking per source
- Seed catalog with 10 official/open-data sources
- Source enable/disable and trust score editing
- RSS ingestion API with deterministic extraction
- GeoRSS coordinate parsing from Atom feeds (USGS, GDACS)
- Nominatim geocoder fallback when the location dictionary misses an entity
- URL and content hash deduplication
- Event similarity deduplication
- Severity and confidence scoring rules
- Groq AI extraction for category, severity, and summary refinement (with deterministic fallback)
- Circuit-breaker guard on Groq to prevent ingestion stalls on API timeouts
- Auto-publishing for high-confidence located events; looser threshold for OFFICIAL_FEED sources
- Bulk-approve action for batch review queue processing
- Review queue with approve/reject/edit/merge actions
- Ranked merge suggestions with reason text
- Persisted extraction/scoring signals for explainable review candidates
- Review evidence with source, publication date, and raw article excerpt
- `occurredAt` field on events + time-window filter on dashboard map
- Timestamps and freshness indicator across events table and detail page
- Category and severity filters on the events page
- Pagination across events API, events page, and review queue
- RSS 2.0 feed output at `/api/events/feed.xml`
- `/api/health` endpoint with DB and Redis status checks
- Lightweight admin token boundary for mutation APIs
- Dashboard, events table, event detail page, and sources page
- Leaflet choropleth risk map with country-level green/yellow/red polygon fills
- BullMQ queue and ingestion worker entrypoint
- Vercel Cron job (daily on Hobby plan) for automatic ingestion
- Vercel Analytics and Speed Insights
- Docker Compose for local PostgreSQL and Redis
- GitHub Actions CI (typecheck + lint + test + build)
- Unit tests for extraction, scoring, deduplication, merge, validation, and admin auth
- Route-handler contract tests for protected mutation APIs
- AI-native engineering workflow (`CLAUDE.md`, `agents/`, `ROADMAP.md`)
- Custom CID MCP server for pipeline inspection
- AI workflow automation hooks and slash commands (`.claude/`)

Not yet complete:

- Admin token auth is lightweight and not a full user/session system.
- Full live database-backed API integration tests are still missing.
- Extraction can still generate noisy candidates from broad news feeds.
- Merge target suggestions are deterministic and may miss cross-feed duplicates.

## Stack

- Next.js 15 App Router, React 19, TypeScript
- PostgreSQL + Prisma ORM
- BullMQ + Redis (ioredis)
- Tailwind CSS + shadcn/ui + Leaflet (choropleth risk map)
- Groq API for optional AI extraction (with deterministic fallback)
- Nominatim for geocoding fallback
- Zod validation
- Vitest
- Docker Compose (local dev), Vercel + Supabase + Upstash (production)
- GitHub Actions CI

## Core Event Categories

- Disease outbreak
- Natural disaster
- Cyber attack
- Transport disruption
- Political unrest
- Food safety alert

## Main Screens

- `/`: dashboard with map and event list
- `/events`: searchable and filterable events table
- `/events/[id]`: event detail page
- `/sources`: source management
- `/admin/review`: human review queue

## API Routes

- `GET/POST /api/events` — list and filter events (paginated)
- `GET /api/events/[id]` — event detail
- `GET /api/events/feed.xml` — RSS 2.0 feed of published events
- `GET/POST /api/sources` — list and create sources
- `POST /api/ingest/rss` — trigger ingestion (admin-protected)
- `PATCH /api/admin/review` — approve/reject/merge review candidates (admin-protected)
- `GET /api/health` — DB and Redis connectivity check

## AI-Native Engineering Workflow

This project uses AI as part of the software development lifecycle, not as a required production dependency.

The workflow is defined in `CLAUDE.md` and `agents/`:
- `agents/planner.md` — task decomposition before any code is written
- `agents/coder.md` — implementation conventions
- `agents/reviewer.md` — code review checklist
- `agents/testing.md` — test strategy
- `agents/refactor.md` — cleanup guidelines
- `agents/devops.md` — infrastructure and deployment

The application must work without external paid AI APIs. Optional local Ollama extraction may be added for the ingestion pipeline, with deterministic rules as the fallback.

See `ROADMAP.md` for the next planned features.

## Architecture Decisions

Architecture Decision Records are stored in `docs/adr/`.

- [ADR 001: AI-Assisted Engineering Workflow](docs/adr/001-ai-assisted-engineering-workflow.md)
- [ADR 002: Hybrid Extraction With Rules Before Ollama](docs/adr/002-hybrid-extraction-rules-before-ollama.md)
- [ADR 003: BullMQ For Ingestion Jobs](docs/adr/003-bullmq-for-ingestion-jobs.md)
- [ADR 004: First Vertical Slice Before Feature Expansion](docs/adr/004-first-vertical-slice-before-feature-expansion.md)

## Deployment

Production stack: Vercel (Next.js + Cron), Supabase (PostgreSQL), Upstash (Redis).

Set the following environment variables in Vercel:
- `DATABASE_URL` — Supabase connection string
- `REDIS_URL` — Upstash Redis URL
- `ADMIN_TOKEN` — secret for admin-protected routes
- `GROQ_API_KEY` — optional, enables AI extraction

## Local Development

Copy environment variables:

```bash
cp .env.example .env
```

Start dependencies:

```bash
docker compose up -d
```

PostgreSQL is exposed on local port `5433` to avoid conflicts with a system PostgreSQL running on `5432`. The container itself still uses PostgreSQL's default internal port `5432`.

Prepare the database:

```bash
npm install
npx prisma migrate dev --name init
npm run prisma:seed
```

Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

Run the optional BullMQ ingestion worker in another terminal:

```bash
npm run worker:ingest
```

Backfill locations for existing local events after improving extraction rules:

```bash
npm run events:backfill-locations
```

Backfill statuses for existing local events after changing auto-publish rules:

```bash
npm run events:backfill-statuses
```

Move low/medium events that were auto-published before the stricter rule back to review:

```bash
npm run events:demote-low-auto-published
```

Reprocess raw articles that were saved before extraction rules improved:

```bash
npm run events:backfill-from-raw
```

The RSS ingestion API can run synchronously for MVP demos or enqueue jobs for the worker:

```bash
curl -X POST http://localhost:3000/api/ingest/rss \
  -H "Content-Type: application/json" \
  -H "x-admin-token: dev-admin-token" \
  -d '{"queue": true}'
```

## Verification

```bash
npx prisma generate
npm run typecheck
npm run test
npm run lint
npm run build
```

## Interview Positioning

This is not just an RSS parser. It is an ingestion pipeline that transforms raw source material into normalized, scored, reviewed risk events.

AI is used as an engineering assistant for planning, review, testing, debugging, and documentation. The production runtime does not depend on paid AI APIs.
