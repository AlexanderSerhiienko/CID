# CID MCP Server

A custom Model Context Protocol server exposing CID-specific tools for use with Claude Code.

## Tools

| Tool | Description |
|---|---|
| `get_pipeline_stats` | Counts of RawArticles and RiskEvents grouped by status |
| `get_review_queue` | Lists events currently in NEEDS_REVIEW status |
| `trigger_ingestion` | Triggers RSS ingestion for all or a specific source |

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
