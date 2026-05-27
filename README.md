# Crisis Intelligence Dashboard

A fullstack crisis intelligence project that turns raw RSS and open-data sources into reviewed, structured risk events.

The product goal is to demonstrate a realistic ingestion pipeline:

```text
Source -> RawArticle -> Extraction -> Normalization -> Deduplication -> Scoring -> Review -> Published RiskEvent
```

## Current Status

This repository currently contains the first vertical MVP skeleton. It is enough to show the intended architecture and run code-level checks, but it is not yet a polished product.

Implemented:

- Next.js App Router application structure
- Prisma schema for `Source`, `RawArticle`, and `RiskEvent`
- Source management page and API
- Seed catalog with 10 official/open-data sources
- Source enable/disable and trust score editing
- RSS ingestion API with deterministic extraction
- Country-level location extraction for map points
- URL and content hash deduplication
- Basic event similarity deduplication
- Severity and confidence scoring rules
- Auto-publishing for high-confidence located events
- Review queue with approve/reject actions
- Review queue edit form for correcting event fields before approval
- Review queue merge action for attaching duplicate evidence to an existing event
- Ranked merge suggestions with reason text
- Persisted extraction/scoring signals for explainable review candidates
- Review evidence with source, publication date, and raw article excerpt
- Lightweight admin token boundary for mutation APIs
- Clear protected-action error UX for missing admin token
- Dashboard, events table, event detail page, and sources page
- Leaflet choropleth risk map with country-level green/yellow/red polygon fills
- BullMQ queue and ingestion worker entrypoint
- Docker Compose for PostgreSQL and Redis
- GitHub Actions CI
- Initial tests for extraction, scoring, and deduplication
- Source validation and pipeline behavior tests
- Route-handler contract tests for protected mutation APIs
- AI-native engineering workflow (`CLAUDE.md`, `agents/`, `ROADMAP.md`)

Verified locally:

- Docker PostgreSQL and Redis are running.
- Initial Prisma migration was applied.
- Seed sources were inserted.
- Playwright verified the ingestion-to-review-to-dashboard loop.
- Playwright verified edit-before-approval review flow.
- Playwright verified source disable/enable and trust score editing.
- Playwright verified manual merge from one review candidate into an existing published event.
- Playwright verified ranked merge suggestions and successful merge.
- Playwright verified mutation failure without admin token and success with saved token.
- Playwright verified protected ingestion shows a clear missing-token message and succeeds after saving the token.
- Route-handler tests verify admin-token enforcement and service calls for source, ingestion, and review mutations.
- Review queue smoke check verified enriched evidence rendering after the `signals` migration.
- Location backfill updated existing local events; 42 of 55 `RiskEvent` rows currently have coordinates.
- Status backfill auto-published high-confidence located events; 16 of 16 `PUBLISHED` rows currently have coordinates.
- Playwright verified the dashboard renders 16 published events after client-only map loading.
- Playwright verified the country risk legend renders on the dashboard map.
- Playwright verified country polygons render with no-data, green, orange, and red risk fills.
- Playwright verified the expanded 10-source catalog renders on `/sources`.
- Playwright verified all 10 sources show non-zero article counts after ingestion.
- Current local dataset has 66 of 66 `PUBLISHED` events with coordinates after source ingestion and backfills.
- Map risk colors now cap low-severity events to green/guarded colors so confidence does not imply impact.
- Dashboard `Published` count now uses a real count query while the side list remains limited to latest events.

Not yet complete:

- Merge target suggestions are deterministic and still need better location quality.
- Existing local events created before the `signals` migration have empty signal arrays unless backfilled.
- Location extraction is deterministic and country-level for many feeds, not a full geocoder.
- Some newly added public agency feeds may be noisy or intermittently unavailable.
- Admin token auth is lightweight and not a full user/session system.
- Ollama runtime extraction is documented but not implemented yet.
- Full live database-backed API integration tests are still missing.
- Extraction still creates noisy candidates from broad news feeds.

## Stack

- Next.js App Router
- TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS
- shadcn/ui
- Leaflet or Mapbox
- BullMQ and Redis
- Docker Compose
- GitHub Actions
- Optional local Ollama for extraction assistance

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

## Backend API Plan

- `/app/api/events/route.ts`
- `/app/api/events/[id]/route.ts`
- `/app/api/sources/route.ts`
- `/app/api/ingest/rss/route.ts`
- `/app/api/admin/review/route.ts`

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
