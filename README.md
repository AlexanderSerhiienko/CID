# Crisis Intelligence Dashboard

A fullstack crisis intelligence dashboard that turns raw RSS and open-data feeds into reviewed, structured risk events for a public map and events registry.

```text
Source -> RawArticle -> rules/GeoRSS extraction -> optional AI enrichment -> human review -> Published RiskEvent
```

## What It Demonstrates

- A production-style ingestion pipeline, not just an RSS reader.
- Clear separation between raw source material (`RawArticle`) and normalized incidents (`RiskEvent`).
- Deterministic extraction and scoring that work without AI.
- Optional Groq enrichment for category, severity, summary, and location refinement.
- Human review with approve, reject, edit, merge, bulk approve, and AI override flows.
- A published event surface with a choropleth risk map, events table, detail pages, and RSS feed.

## Current Flow

1. **Sources**
   Admins manage RSS/open-data sources, trust scores, and enabled state in `/sources`.

2. **Ingestion**
   Vercel Cron runs daily, and admins can trigger ingestion manually through `POST /api/ingest/rss`.
   Ingestion fetches enabled sources, deduplicates articles by URL/content hash, stores raw articles, and extracts a deterministic baseline.

3. **AI Enrichment**
   The review page automatically processes pending enrichment work through `POST /api/admin/process-next`.
   AI enrichment is optional and bounded by timeout/rate-limit handling. If Groq is unavailable, the deterministic pipeline still works.

4. **Review**
   `/admin/review` separates work into practical queues:
   - **AI Ready**: AI-confirmed events ready for review or bulk approval.
   - **Coordinates**: events created from feeds that include coordinate data.
   - **Needs Enrichment**: deterministic candidates waiting for AI refinement.
   - **AI Rejected**: articles AI marked as not relevant, with a human override option.

5. **Publishing**
   Approved events become `PUBLISHED` and appear on the dashboard map, events table, detail pages, and `/api/events/feed.xml`.

## Main Screens

- `/`: dashboard with country-level risk map and recent published events.
- `/events`: published event registry with filters and separate AI-reviewed vs deterministic sections.
- `/events/[id]`: event detail page with evidence and metadata.
- `/sources`: source catalog and source health controls.
- `/admin/review`: admin review queue and enrichment workflow.

## API Routes

- `GET /api/events`: published events with pagination and filters.
- `GET /api/events/[id]`: published event detail.
- `GET /api/events/feed.xml`: RSS feed of published events.
- `GET /api/sources`: list sources.
- `POST /api/sources`: create a source, admin-protected.
- `PATCH /api/sources/[id]`: update source settings, admin-protected.
- `POST /api/ingest/rss`: trigger ingestion, admin-protected.
- `POST /api/admin/process-next`: process one enrichment queue item, admin-protected.
- `POST /api/admin/promote-article`: promote an AI-rejected raw article into review, admin-protected.
- `POST /api/admin/bulk-approve`: publish AI-ready review events, admin-protected.
- `PATCH /api/admin/review`: approve, reject, edit, or merge review candidates, admin-protected.
- `GET /api/health`: application and database health check.

## Stack

- Next.js 15 App Router, React 19, TypeScript
- PostgreSQL + Prisma ORM
- Tailwind CSS, shadcn/ui, Leaflet
- Zod validation at API boundaries
- Vitest for unit and route-handler tests
- Docker Compose for local PostgreSQL
- Vercel + Supabase for production
- Optional Groq extraction with deterministic fallback

## Data Model

- `Source`: configured feed with trust score, enabled state, and health metadata.
- `RawArticle`: raw ingested article with source link, content hash, AI queue flags, and optional `RiskEvent` link.
- `RiskEvent`: normalized crisis event with category, severity, confidence, location, status, evidence, and extraction signals.

Event statuses:

```text
NEEDS_REVIEW -> PUBLISHED | REJECTED
```

Event categories:

- Disease outbreak
- Natural disaster
- Cyber attack
- Transport disruption
- Political unrest
- Food safety alert
- Unknown

## Local Development

Copy environment variables:

```bash
cp .env.example .env
```

Start local services:

```bash
docker compose up -d
```

Install dependencies, migrate, and seed:

```bash
npm install
npx prisma migrate dev
npm run prisma:seed
```

Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

Trigger ingestion manually:

```bash
curl -X POST http://localhost:3000/api/ingest/rss \
  -H "Content-Type: application/json" \
  -H "x-admin-token: dev-admin-token" \
  -d '{}'
```

## Environment Variables

Required:

- `DATABASE_URL`: PostgreSQL connection string used by the app runtime.
- `DIRECT_URL`: direct PostgreSQL connection string used by Prisma migrations.
- `ADMIN_TOKEN`: shared admin token for protected mutation routes.

Optional:

- `GROQ_API_KEY`: enables AI enrichment. The app still works without it.
- `CRON_SECRET`: protects scheduled ingestion if enabled in deployment.
- `REDIS_URL`: reserved for hosted queue/cache integration.

For Supabase on Vercel, use the pooler URL for `DATABASE_URL` and a direct/session-compatible URL for `DIRECT_URL`.

## Verification

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Architecture Decisions

Architecture Decision Records are stored in `docs/adr/`.

- [ADR 001: AI-Assisted Engineering Workflow](docs/adr/001-ai-assisted-engineering-workflow.md)
- [ADR 002: Hybrid Extraction With Rules Before Groq](docs/adr/002-hybrid-extraction-rules-before-groq.md)
- [ADR 003: Vercel Cron Inline Ingestion](docs/adr/003-vercel-cron-inline-ingestion.md)
- [ADR 004: First Vertical Slice Before Feature Expansion](docs/adr/004-first-vertical-slice-before-feature-expansion.md)

## Demo Script

1. Open `/` and show the risk map backed by published events.
2. Open `/events` and point out AI-reviewed and deterministic event sections.
3. Open `/sources` and show source trust scores and health metadata.
4. Open `/admin/review` and explain the four queues: AI Ready, Coordinates, Needs Enrichment, AI Rejected.
5. Approve or reject one candidate, then return to `/events` or the map to show the published surface.

## Interview Positioning

This project is a realistic ingestion and review system: it fetches raw source material, normalizes it, enriches it when AI is available, preserves deterministic fallback behavior, and keeps a human in the loop before publication.
