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

### Priority 1 — Make the Data Readable (timestamps everywhere)

**Problem:** The events table has no date column. The dashboard sidebar has no timestamps. Event detail
has no date. A "crisis" dashboard where you can't tell if something happened yesterday or 6 months ago
is useless for situational awareness.

**Changes:**

#### 1a. Date column in events table (`app/events/page.tsx`)
- Add a "Date" column (rightmost, or between Location and Severity)
- Show `createdAt` formatted as "May 28" (same year) or "May 28, 2025" (different year)
- Make it sortable (default: newest first — already the case)

#### 1b. "X time ago" on dashboard sidebar (`app/page.tsx`)
- Each event in "Latest published events" sidebar shows "3 hours ago" or "2 days ago"
- Use a simple relative-time helper (no library needed — calculate diff server-side)

#### 1c. Dashboard freshness header (`app/page.tsx`)
- "Data last updated: 2 hours ago" next to the stat cards
- One query: `max(source.lastIngestedAt)` across enabled sources
- Add honest note: "Updated daily at 8am UTC"

#### 1d. Event detail — show dates + mini-map (`app/events/[id]/page.tsx`)
- Add "Published" date in the stat cards row
- If `latitude` and `longitude` exist, render a small Leaflet map with a pin (reuse `EventMapClient` or a new `SinglePinMap` component)
- Show each rawArticle with its `publishedAt` date

**Acceptance criteria:**
- [ ] Events table has a visible date column
- [ ] Dashboard sidebar shows relative timestamps
- [ ] Dashboard header shows last ingestion time + "Updated daily at 8am UTC"
- [ ] Event detail shows date and a pin map when coordinates are available

---

### Priority 2 — Add `occurredAt` + Time-Filtered Map

**Problem:** `RiskEvent.createdAt` is the DB insert time, not when the event actually happened.
The map is a cumulative heatmap of all history — there's no way to ask "what's happening this week?"

**Changes:**

#### 2a. Add `occurredAt` to `RiskEvent` schema (`prisma/schema.prisma`)
```
occurredAt  DateTime?   // earliest publishedAt from associated RawArticles; null if unknown
```
- Migration: `ALTER TABLE "RiskEvent" ADD COLUMN "occurredAt" TIMESTAMP;`
- Populate in `lib/pipeline/rss.ts` when creating a new RiskEvent: set to `publishedAt` of the triggering article
- Backfill script: for existing events, set `occurredAt = MIN(rawArticles.publishedAt)` where not null

#### 2b. Time filter on dashboard map (`app/page.tsx`)
- Add a filter toggle: `Last 7 days / Last 30 days / All time` (default: Last 30 days)
- Pass as searchParam, filter `mapEvents` and `latestEvents` queries by `occurredAt >= cutoff`
- The choropleth colors reflect only the selected window

**Acceptance criteria:**
- [ ] `occurredAt` field exists on RiskEvent
- [ ] New events get `occurredAt` set at creation
- [ ] Backfill script runs clean (`npm run events:backfill-occurred-at`)
- [ ] Dashboard map has time filter, default 30 days
- [ ] Switching filter updates both the map and the sidebar list

---

### Priority 3 — Unblock the Pipeline (auto-publish threshold)

**Problem:** The current auto-publish rule (confidence ≥ 0.7 AND location resolved AND severity ≥ HIGH)
is too strict. Most events from high-trust OFFICIAL_FEED sources end up in NEEDS_REVIEW. 183 of 192
events are stuck there. Nobody is reviewing them manually, so the published map stays sparse.

**Changes:**

#### 3a. Loosen auto-publish for trusted sources (`lib/pipeline/scoring.ts`)
Current rule:
```
confidence >= 0.7 AND locationConfidence > 0 AND severity >= HIGH → PUBLISHED
```
New rule:
```
OFFICIAL_FEED source: confidence >= 0.6 AND severity >= MEDIUM → PUBLISHED
Others: confidence >= 0.7 AND locationConfidence > 0 AND severity >= HIGH → PUBLISHED
```

#### 3b. "Approve all trusted" admin action (`app/admin/review/page.tsx` + API)
- Button: "Approve all OFFICIAL_FEED events in review"
- `POST /api/admin/review/bulk-approve` with `sourceType: "OFFICIAL_FEED"`
- Publishes all NEEDS_REVIEW events whose source is OFFICIAL_FEED
- Shows count: "Approved 183 events"

#### 3c. Backfill existing events with new threshold
- `npm run events:backfill-statuses` already exists — re-run after threshold change
- Or add a dedicated `npm run events:promote-trusted` script

**Acceptance criteria:**
- [ ] New OFFICIAL_FEED events at MEDIUM+ severity auto-publish
- [ ] "Approve all trusted" button works and shows count
- [ ] Existing 183 backlog cleared (either bulk action or backfill)
- [ ] `npm run typecheck && npm run test` pass

---

### Priority 4 — RSS Output + Cadence Honesty

**Problem:** No way for users to subscribe to new events. No indication in the UI how fresh the data is.
Vercel Hobby plan limits cron to 1/day — this is a hard constraint, and the UI should be honest about it.

#### 4a. RSS feed output (`app/api/events/feed.xml/route.ts`)
- `GET /api/events/feed.xml` — standard RSS 2.0
- Returns last 50 PUBLISHED events ordered by `occurredAt` desc
- Supports `?category=NATURAL_DISASTER` filter
- Zero infrastructure cost, lets users subscribe from any feed reader

#### 4b. Cadence transparency
- Dashboard: "Updated daily at 8am UTC · Next update in ~6h" (calculate from `lastIngestedAt`)
- Sources page: show time until next ingestion
- No pretending this is a live feed — it isn't, and that's fine for the use case

**Acceptance criteria:**
- [ ] `GET /api/events/feed.xml` returns valid RSS 2.0
- [ ] Feed validates in an RSS reader
- [ ] Dashboard shows next update countdown
- [ ] Link to feed in dashboard footer or header

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
