# CID MCP Server

A custom Model Context Protocol server exposing CID-specific tools for use with Claude Code.

## Tools

| Tool | Description |
|---|---|
| `get_pipeline_stats` | Counts of enabled sources, RawArticles, and RiskEvents grouped by status |
| `get_review_queue` | Lists events currently in NEEDS_REVIEW status (optional `limit`) |
| `trigger_ingestion` | Triggers RSS ingestion for all enabled sources or a specific source by ID (time-budgeted) |
| `explain_event_signals` | Returns the full signals array behind a RiskEvent's severity and confidence |
| `suggest_source_trust_score` | Suggests a new trust score for a source from its approval history |
| `bulk_reject_low_confidence` | Rejects NEEDS_REVIEW events below a confidence threshold (dry-run by default) |

## Setup

### Prerequisites
- Docker running (`docker compose up -d`)
- `DATABASE_URL` set in `.env`

### Connect to Claude Code

From the project root:

```bash
claude mcp add cid-mcp -- npm run mcp
```

Verify it's connected:

```bash
claude mcp list
```

### Usage examples in Claude Code

```
show pipeline stats
trigger ingestion
show review queue
explain the signals for event <id>
suggest a trust score for source <id>
bulk reject review events below 0.4 confidence (dry run)
```

## Development

Run the server directly to test it:

```bash
npm run mcp
```

Or send raw JSON-RPC:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | npm run mcp
```
