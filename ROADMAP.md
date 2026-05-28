# Roadmap

Three features remaining to make this project fully AI-native.
Work on them in order — each builds on the previous.

---

## 1. AI Extraction

**What:** Optionally enhance pipeline extraction with Groq API (free tier, llama3) — improves category, severity, and summary quality over pure keyword rules.

**Why:** Right now the pipeline is 100% deterministic rules. Groq makes AI an actual part of the product runtime, not just a dev tool. Runs on the free tier — no cost, no infra required.

**Architecture:**
```
rawText
  → deterministic rules (always runs)
  → optional Groq call (if GROQ_API_KEY is set)
  → Zod schema validation
  → fallback to rules if invalid, timeout, or key missing
  → RiskEvent candidate
```

**Implementation:**
- `lib/pipeline/ai-extraction.ts` — `extractWithAI()` calls Groq, validates with Zod
- `lib/pipeline/rss.ts` — applies AI result after GeoRSS + Nominatim, before DB write
- Gate: `GROQ_API_KEY` env var (absent → skip silently)
- 8s timeout, falls back to rules on any error

**Acceptance criteria:**
- [x] App works identically without `GROQ_API_KEY` (default)
- [x] Groq output passes Zod validation before touching the DB
- [x] Timeout is enforced (8s)
- [x] Fallback to rules is tested (7 unit tests in `ai-extraction.test.ts`)

---

## 2. MCP Integration

**What:** Connect real tools via Model Context Protocol so AI agents can interact with the project directly.

**Why:** MCP is the standard for AI-tool integration. Having it in the project demonstrates you understand the protocol, not just the concept.

**Three parts:**

### 2a. GitHub MCP (existing server)
Connect the official GitHub MCP server to Claude Code.
- Lets Claude see issues, PRs, and repo state without copy-pasting
- Setup: add to Claude Code MCP config, point at this repo
- No code changes needed in the app itself

### 2b. PostgreSQL MCP (existing server)
Connect the official PostgreSQL MCP server pointing at the local CID database.
- Lets Claude query `RiskEvent`, `Source`, `RawArticle` directly
- Useful for debugging pipeline output without opening Prisma Studio
- Setup: add to Claude Code MCP config with `DATABASE_URL`

### 2c. Custom MCP Server (build this)
Build a small MCP server that exposes CID-specific tools:

```
tools:
  - trigger_ingestion   — POST /api/ingest/rss, return job status
  - get_pipeline_stats  — count of RawArticles, RiskEvents by status
  - get_review_queue    — list current NEEDS_REVIEW events
```

**Where to start:**
- Create `mcp/` directory in project root
- Use `@modelcontextprotocol/sdk` (TypeScript)
- Each tool calls the existing API routes or Prisma directly
- Add `mcp/README.md` explaining how to connect it to Claude Code

**Acceptance criteria:**
- [x] GitHub MCP connected and working in Claude Code
- [x] PostgreSQL MCP connected and working in Claude Code
- [x] Custom MCP server runs locally (`npm run mcp`)
- [x] All 3 custom tools return valid responses
- [x] `mcp/README.md` explains setup

---

## 3. Deployment

**What:** Get the project running on a real URL.

**Why:** A live URL changes how the project is perceived. Without it, everything feels like a local experiment.

**Recommended stack:**
- **App:** Vercel (Next.js native, free tier)
- **Database:** Supabase (PostgreSQL, free tier)
- **Redis:** Upstash (serverless Redis, free tier)
- **Worker:** Vercel Cron (for scheduled ingestion) or keep manual

**Steps:**
1. Create Supabase project → get `DATABASE_URL`
2. Create Upstash Redis → get `REDIS_URL`
3. Run `npx prisma migrate deploy` against Supabase
4. Deploy to Vercel → set env vars
5. Add `/api/health` route that checks DB + Redis connectivity
6. Test the full loop on production: ingest → review → publish → map

**Before deploying:**
- Replace `ADMIN_TOKEN=dev-admin-token` with a real secret in Vercel env vars
- Make sure no `.env` values are hardcoded anywhere

**Acceptance criteria:**
- [x] App is live on a public URL
- [x] `/api/health` returns 200 with DB + Redis status
- [x] Full pipeline works on production (ingest → publish)
- [x] CI deploys automatically on push to `main`
