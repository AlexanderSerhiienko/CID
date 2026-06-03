# Crisis Intelligence Dashboard

A fullstack ingestion pipeline that turns raw RSS and open-data feeds into reviewed, structured **risk events** — surfaced on a choropleth risk map, an events registry, and a public RSS feed.

```text
Source → RawArticle → rules / GeoRSS extraction → optional AI enrichment → human review → Published RiskEvent
```

It is a portfolio project: a realistic, production-shaped pipeline rather than a thin RSS reader, with a deterministic baseline that works with no external AI and a human kept in the loop before anything is published.

---

## What It Demonstrates

- A multi-stage ingestion pipeline with a clear split between raw source material (`RawArticle`) and normalized incidents (`RiskEvent`).
- **Deterministic extraction, scoring, and deduplication** that run fully without AI — the app never depends on a paid API.
- **Optional Groq enrichment** for category, severity, summary, and location, layered on top of the deterministic baseline and gated by timeout, rate limiting, and Zod validation.
- **Optional Nominatim geocoding** (rate-limited, timeout-gated) to resolve coordinates from extracted place names.
- A human review workflow: approve, reject, edit, merge, bulk-approve, and override of AI-rejected articles, with ranked merge suggestions.
- A published surface: Leaflet choropleth map, filterable events table, detail pages, and an RSS 2.0 feed.
- A custom **Model Context Protocol (MCP) server** exposing six pipeline-introspection tools to Claude Code.

---

## Architecture & Flow

```text
Source (RSS / open-data / official feed)
   │   fetch + parse (10s timeout) · dedup by URL + content hash
   ▼
RawArticle
   ├─ feed carries GeoRSS coordinates ─► score ─► RiskEvent  (extractionSource = "georss")
   │
   └─ no coordinates ─► queued (aiPending = true) ─► AI enrichment step
                                                       │  Groq extract → Nominatim geocode → score
                                                       ├─ risk event   ─► RiskEvent (extractionSource = "ai")
                                                       └─ not a risk    ─► RawArticle.aiRejected = true
                                                                            (human can still promote it)
   ▼
RiskEvent  (status = NEEDS_REVIEW)        ← every candidate stops here; there is no auto-publish
   │   human review: approve / reject / edit / merge / bulk-approve / promote
   ▼
RiskEvent  (status = PUBLISHED)  ─►  map · /events · /events/[id] · RSS feed
```

### 1. Ingestion (`lib/pipeline/rss.ts`)

Fetches each enabled source (10-second timeout), deduplicates by normalized URL and content hash, and stores a `RawArticle`. It then splits:

- **GeoRSS path** — when the feed item carries coordinates (`georss:point` or `geo:lat`/`geo:long`, e.g. the USGS earthquake feed), location is already precise, so a `RiskEvent` is created immediately with `extractionSource = "georss"`. No AI needed.
- **Non-GeoRSS path** — the `RawArticle` is queued with `aiPending = true` and no event is created yet, keeping the ingest request fast and Groq rate-limiting out of the hot path. Articles the deterministic rules judge as non-incidents are stored for audit but not queued.

Both paths first run deduplication against live events from the last 5 days; a match links the new article as evidence and nudges the existing event's confidence instead of creating a duplicate.

### 2. Deterministic baseline (`lib/pipeline/extraction.ts`, `scoring.ts`)

Always runs, with or without AI:

- **Category** — keyword rules across six incident categories (anything unmatched stays `UNKNOWN`), with special handling for earthquake magnitude text.
- **Location** — dictionary match against country/city centroids (title preferred over body), yielding country- or city-level confidence.
- **Severity** — keyword escalation (`death`, `evacuation`, `state of emergency`, …) plus earthquake magnitude thresholds.
- **Confidence** — a base score combined with category, location, and severity bonuses, then `+ trustScore × 0.25`, `+0.15` for "confirmed" language and `−0.1` for "suspected/possible".

### 3. AI enrichment (`lib/pipeline/ai-enrichment.ts`, `ai-extraction.ts`)

Optional and bounded. For each `aiPending` article, Groq is asked to refine category, severity, summary, city, and country; Nominatim geocodes a city it finds. Results are applied on top of the deterministic baseline, the candidate is scored, and a `RiskEvent` is created. If Groq is unavailable the article stays pending for the next run; if it returns invalid output or judges the article not a risk event, the article is marked `aiRejected` for optional human override. The same module also re-enriches existing GeoRSS or manually promoted events.

### 4. Scheduled ingestion (`lib/pipeline/timed-ingest.ts`, `ingest-queue.ts`)

A Vercel Cron job hits `GET /api/cron/ingest` daily at 08:00 UTC. Sources run through an in-process serialized queue (no external broker) under a ~50s time budget that fits inside the serverless window; any sources not reached are handed off to `POST /api/admin/ingest-continue` to finish on a fresh invocation. Manual ingestion is available to admins via `POST /api/ingest/rss`.

### 5. Review (`/admin/review`)

The queue is split into four tabs, each backed by a precise query:

| Tab | Contents |
|---|---|
| **AI Ready** | AI-enriched `NEEDS_REVIEW` events, with evidence + extraction signals and a bulk-approve action |
| **Coordinates** | GeoRSS events awaiting review |
| **Needs Enrichment** | rules-only candidates still waiting for AI refinement |
| **Filtered (AI)** | `aiRejected` raw articles, each promotable back into the queue |

A stats strip tracks articles still **Enriching**, **Filtered by AI**, events **Awaiting review**, **Published**, and **Rejected**. Ranked merge suggestions appear automatically per candidate.

### 6. Publishing

Approved events become `PUBLISHED` and appear on the dashboard map, the events registry, detail pages, and `/api/events/feed`.

---

## Screens

| Route | Purpose |
|---|---|
| `/` | Dashboard: Leaflet risk map + sidebar with time-window filter (7d / 30d / all), quick stats, and recent events |
| `/events` | Published events registry with search and filters, split into **AI Reviewed** and **Deterministic** tables |
| `/events/[id]` | Event detail with evidence articles and metadata |
| `/sources` | Source catalog with trust score, enable/disable, and health metadata |
| `/admin/review` | Admin review queue and enrichment workflow (server-gated by the admin cookie) |

---

## API Reference

### Public

| Method & path | Description |
|---|---|
| `GET /api/events` | Published events; filters: `q`, `category`, `severity`, `country`; paginated (`page`, `limit`) |
| `GET /api/events/[id]` | Published event detail with evidence |
| `GET /api/events/feed` | RSS 2.0 feed of the 50 most recent published events; optional `?category=`. Also reachable as `/api/events/feed.xml` via a `next.config` rewrite |
| `GET /api/health` | Application + database health check (`200` ok / `503` degraded) |

### Admin — require the `x-admin-token` header

| Method & path | Description |
|---|---|
| `GET /api/sources` | List sources with article counts |
| `POST /api/sources` | Create a source (Zod-validated, SSRF-safe URL allowlist) |
| `PATCH /api/sources/[id]` | Update trust score / enabled / metadata |
| `POST /api/ingest/rss` | Trigger ingestion manually |
| `GET /api/admin/review` | Fetch the `NEEDS_REVIEW` queue with evidence |
| `PATCH /api/admin/review` | Approve, reject, edit, or merge a candidate |
| `POST /api/admin/bulk-approve` | Publish all AI-enriched `NEEDS_REVIEW` events |
| `POST /api/admin/enrich` | Run AI enrichment for a batch (default 20) or a single article/event |
| `POST /api/admin/process-next` | Process exactly one item from the enrichment queue (driven by the review page's auto-enricher loop) |
| `POST /api/admin/promote-article` | Promote an AI-rejected article into the review queue via deterministic extraction |

### Cron — require `Authorization: Bearer <CRON_SECRET>`

| Method & path | Description |
|---|---|
| `GET /api/cron/ingest` | Scheduled ingestion (Vercel Cron); time-budgeted with continuation |
| `POST /api/admin/ingest-continue` | Continuation endpoint for sources not reached within the time budget |

Admin auth is a lightweight shared token, not a full session system (intentional for an MVP). The token is sent as the `x-admin-token` header on mutation routes and stored in a `cid-admin-token` cookie that server-gates `/admin/review` before any query runs. When `ADMIN_TOKEN` is unset, admin checks pass **only** in local development (`NODE_ENV=development`); every other environment denies them.

---

## Data Model

**`Source`** — a configured feed: `name`, unique `url`, `type` (`RSS` · `OPEN_DATA` · `OFFICIAL_FEED` · `NEWS`), `enabled`, `trustScore` (default `0.5`), and `lastIngestedAt` / `lastError` health fields.

**`RawArticle`** — a raw ingested article: `title`, unique `url`, unique `contentHash`, `rawText`, optional `publishedAt`, an optional link to a `RiskEvent`, and the AI queue flags `aiPending` (queued for enrichment) and `aiRejected` (AI judged it not a risk event; shown for human override).

**`RiskEvent`** — a normalized incident: `title`, `summary`, `category`, location (`country`, `city`, `latitude`, `longitude`, `locationConfidence`), `severity`, `confidence`, `status`, a `signals` JSON array recording every pipeline factor, `sourceUrl`, `occurredAt`, plus provenance flags `extractionSource` (`"rules"` · `"ai"` · `"georss"`), `aiEnhanced`, and `geocoderUsed`.

```text
Event status:    NEEDS_REVIEW → PUBLISHED | REJECTED      (no auto-publish; DRAFT was removed)
Event category:  DISEASE_OUTBREAK · NATURAL_DISASTER · CYBER_ATTACK · TRANSPORT_DISRUPTION ·
                 POLITICAL_UNREST · FOOD_SAFETY_ALERT · UNKNOWN
Severity:        LOW · MEDIUM · HIGH · CRITICAL
```

---

## Stack

- **Framework** — Next.js 15 (App Router), React 19, TypeScript (strict)
- **Database** — PostgreSQL + Prisma 6 (local: Docker on host port 5433; production: Supabase, pooled `DATABASE_URL` on 6543, direct `DIRECT_URL` on 5432 for migrations)
- **UI** — Tailwind CSS, shadcn/ui, Leaflet via react-leaflet, topojson / world-atlas choropleth
- **Validation** — Zod at every API boundary
- **AI (optional)** — Groq for extraction/enrichment, with deterministic rules as the always-on baseline
- **Geocoding (optional)** — Nominatim (OpenStreetMap), rate-limited and timeout-gated
- **Scheduling** — Vercel Cron + an in-process serialized ingest queue
- **MCP** — a custom CID server (`mcp/server.ts`) over stdio
- **Tests** — Vitest (co-located `*.test.ts`)
- **Infra** — Docker Compose (PostgreSQL), GitHub Actions CI, deployed on Vercel + Supabase

---

## Local Development

```bash
# 1. Environment
cp .env.example .env

# 2. Database (PostgreSQL on host port 5433)
docker compose up -d

# 3. Install, migrate, seed 10 official / open-data sources
npm install
npx prisma migrate dev
npm run prisma:seed

# 4. Run
npm run dev          # http://localhost:3000
```

Trigger ingestion manually (uses the dev admin token from `.env.example`):

```bash
curl -X POST http://localhost:3000/api/ingest/rss \
  -H "Content-Type: application/json" \
  -H "x-admin-token: dev-admin-token" \
  -d '{}'
```

### Useful scripts

```bash
npm run dev            # Next.js dev server
npm run build          # prisma generate + production build
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run test           # vitest run
npm run test:watch     # vitest (watch)
npm run prisma:migrate # prisma migrate dev
npm run prisma:seed    # seed sources
npm run mcp            # run the CID MCP server over stdio
```

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection used at runtime (Supabase pooler in production) |
| `DIRECT_URL` | for migrations / prod | Direct PostgreSQL connection used by `prisma migrate` |
| `ADMIN_TOKEN` | yes in deployed envs | Shared token for admin mutation routes. If unset, admin checks pass only when `NODE_ENV=development` |
| `GROQ_API_KEY` | optional | Enables Groq AI enrichment. The pipeline runs fully without it |
| `NOMINATIM_ENABLED` | optional | Geocoding toggle; enabled by default, set to `"false"` to disable |
| `CRON_SECRET` | optional | Bearer secret for `/api/cron/ingest` and `/api/admin/ingest-continue` |
| `NEXT_PUBLIC_BASE_URL` | optional | Absolute base URL used in RSS feed item links |

On Vercel, `VERCEL_URL` is provided automatically and used to build the cron continuation URL. For Supabase, use the pooler URL for `DATABASE_URL` and a direct/session URL for `DIRECT_URL`.

---

## MCP Server

A custom Model Context Protocol server (`mcp/server.ts`) exposes six tools for inspecting and driving the pipeline from Claude Code:

| Tool | Description |
|---|---|
| `get_pipeline_stats` | Source / RawArticle / RiskEvent counts grouped by status |
| `get_review_queue` | Events currently in `NEEDS_REVIEW` |
| `trigger_ingestion` | Run ingestion for all enabled sources or one by ID (time-budgeted) |
| `explain_event_signals` | The full signals array behind an event's severity and confidence |
| `suggest_source_trust_score` | A data-driven trust-score suggestion from a source's approval history |
| `bulk_reject_low_confidence` | Reject `NEEDS_REVIEW` events below a confidence threshold (dry-run by default) |

```bash
# Connect to Claude Code from the project root
claude mcp add cid-mcp -- npm run mcp
claude mcp list
```

See [`mcp/README.md`](mcp/README.md) for details.

---

## Testing & CI

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Vitest covers the pipeline (extraction, scoring, deduplication, similarity, hashing, RSS parsing, AI enrichment/extraction, geocoder), review logic (merge, merge-suggestions), validation, admin/cron auth, and API route contracts. GitHub Actions (`.github/workflows/ci.yml`) provisions PostgreSQL, applies migrations, and runs typecheck → lint → test → build on every pull request and push to `main`, plus a dependency-review job on PRs.

---

## Project Structure

```text
app/
  api/                 events · events/[id] · events/feed · sources · ingest/rss
                       cron/ingest · health · admin/{review,bulk-approve,enrich,
                       process-next,promote-article,ingest-continue}
  admin/review/        review queue UI (server-gated)
  events/ · sources/   public registry + source management
  page.tsx             dashboard (map + recent events)
lib/
  pipeline/            rss · extraction · ai-extraction · ai-enrichment · scoring ·
                       deduplication · similarity · hash · geocoder · ingest-queue · timed-ingest
  review/              merge · merge-suggestions
  auth/                admin token + cron secret validation
  validation/          Zod schemas + SSRF-safe URL allowlist
  map/                 country risk aggregation + centroids
components/            shadcn/ui-based React components
mcp/                   custom CID MCP server (6 tools over stdio)
prisma/                schema.prisma · migrations · seed (10 sources)
```

Planned work and detailed specs live in [`ROADMAP.md`](ROADMAP.md). Not yet implemented: full user/session auth (only the lightweight admin token + cookie today) and live database integration tests (current tests mock Prisma).
