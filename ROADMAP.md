# Roadmap

## Completed

### AI Extraction (Groq)
Enhance pipeline extraction with Groq API (free tier, llama3). Improves category, severity, and summary quality over pure keyword rules. Gated by `GROQ_API_KEY` — falls back to rules silently on any error or timeout.

- [x] App works identically without `GROQ_API_KEY`
- [x] Groq output passes Zod validation before touching the DB
- [x] 8s timeout enforced
- [x] 7 unit tests in `ai-extraction.test.ts`

### MCP Integration
- [x] GitHub MCP connected and working in Claude Code
- [x] PostgreSQL MCP connected and working in Claude Code
- [x] Custom MCP server runs locally (`npm run mcp`) — 3 tools: `trigger_ingestion`, `get_pipeline_stats`, `get_review_queue`
- [x] `mcp/README.md` explains setup

### Deployment
- [x] App live on Vercel: https://crisis-intelligence-dashboard.vercel.app
- [x] `/api/health` returns 200 with DB + Redis status
- [x] Full pipeline works on production (ingest → publish)
- [x] CI deploys automatically on push to `main`
- [x] Vercel Cron: daily ingestion at 8am UTC (`0 8 * * *`)

### Pagination
- [x] `GET /api/events` — `page` + `limit` + `total` + `totalPages`
- [x] `/events` page — Prev/Next, category/severity/status filters
- [x] `/admin/review` page — Prev/Next, total count in header

### GeoRSS + Nominatim + Source Health
- [x] GeoRSS parsing (`georss:point`, `geo:lat`/`geo:long`) for USGS/GDACS feeds
- [x] Nominatim geocoder fallback — resolves lat/lon for events where dictionary extraction found no match
- [x] Source health fields — `lastIngestedAt`, `lastError` — visible in Sources UI

---

## Active — Make the Dashboard Actually Useful

The pipeline works. The data exists. The problem: you can't tell when anything happened, the map shows
everything since the beginning of time, and 183 events are stuck in NEEDS_REVIEW because the
auto-publish threshold is too strict. These items fix that.

---

### Priority 1 — Make the Data Readable ✅

- [x] Events table has a Date column (occurredAt or createdAt, formatted "May 28")
- [x] Dashboard sidebar shows relative timestamps ("3 hours ago · United States")
- [x] Dashboard header shows "Data last updated X ago · Updated daily at 8am UTC · Next update in ~Xh"
- [x] Event detail shows "Occurred X ago · May 28" + publishedAt on each evidence article
- [x] `formatRelativeTime` / `formatDate` / `hoursUntilNextDailyRun` helpers + 11 unit tests

---

### Priority 2 — `occurredAt` + Time-Filtered Map ✅

- [x] `occurredAt DateTime?` field on `RiskEvent` (migration applied to production)
- [x] Pipeline populates it from the triggering article's `publishedAt`
- [x] Dashboard map time filter: Last 7 days / Last 30 days / All time (default: 30d)
- [x] Filter applies to both choropleth and sidebar event list
- [x] Events table date column uses `occurredAt` when available

---

### Priority 3 — Unblock the Pipeline ✅

- [x] `OFFICIAL_FEED` sources auto-publish at MEDIUM+ severity, confidence ≥ 0.6
- [x] `POST /api/admin/bulk-approve` endpoint (admin-protected)
- [x] "Approve all trusted sources (N)" button in review queue
- [x] 3 new scoring unit tests covering the OFFICIAL_FEED path

---

### Priority 4 — RSS Feed + Cadence Honesty ✅

- [x] `GET /api/events/feed` — RSS 2.0, last 50 published events, `?category=` filter
- [x] `/api/events/feed.xml` rewrite alias (Next.js doesn't support dots in route segment names)
- [x] RSS autodiscovery `<link>` in `<head>` — feed readers detect it automatically
- [x] RSS icon + link in page footer
- [x] Dashboard shows "Updated daily at 8am UTC · Next update in ~Xh"

---

## Honest Constraints

**Ingestion cadence:** Vercel Hobby plan allows 1 cron per day maximum. This means events appear on the
dashboard up to 24 hours after they occur. This is a known limitation — the UI will say so explicitly.
Upgrading to Vercel Pro ($20/mo) enables hourly cron. For now, daily is the honest choice.

**Location coverage:** Nominatim resolves country-level coordinates for ~60% of articles. City-level
precision depends on how specific the article title is. Some events will always show "Location pending."

**AI extraction:** Groq free tier has rate limits. Each article that passes the `isLikelyRiskEvent`
check triggers one Groq call. USGS/GDACS feeds (GeoRSS) skip Groq entirely — coordinates are already
precise. On a busy day with many new non-GeoRSS articles, Groq may rate-limit; pipeline falls back to
rules silently.
