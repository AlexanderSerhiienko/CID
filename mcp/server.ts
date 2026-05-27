import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { PrismaClient, EventStatus } from "@prisma/client";

const prisma = new PrismaClient();

const server = new Server(
  { name: "cid-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ─── Tool definitions ────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_pipeline_stats",
      description:
        "Returns counts of RawArticles and RiskEvents grouped by status. Use this to get an overview of the CID pipeline state.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_review_queue",
      description:
        "Returns all RiskEvents currently in NEEDS_REVIEW status. Use this to see what events are waiting for human review.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of events to return (default: 20)",
          },
        },
      },
    },
    {
      name: "trigger_ingestion",
      description:
        "Triggers RSS ingestion for all enabled sources or a specific source by ID. Returns ingestion results.",
      inputSchema: {
        type: "object",
        properties: {
          sourceId: {
            type: "string",
            description: "Optional: ingest a single source by ID. Omit to ingest all enabled sources.",
          },
        },
      },
    },
  ],
}));

// ─── Tool handlers ────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "get_pipeline_stats": {
      const [rawArticleCount, riskEventsByStatus, sourcesCount] = await Promise.all([
        prisma.rawArticle.count(),
        prisma.riskEvent.groupBy({
          by: ["status"],
          _count: { id: true },
        }),
        prisma.source.count({ where: { enabled: true } }),
      ]);

      const statusCounts = Object.fromEntries(
        riskEventsByStatus.map((row) => [row.status, row._count.id])
      );

      const totalRiskEvents = riskEventsByStatus.reduce(
        (sum, row) => sum + row._count.id,
        0
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                sources: { enabled: sourcesCount },
                rawArticles: { total: rawArticleCount },
                riskEvents: {
                  total: totalRiskEvents,
                  byStatus: {
                    DRAFT: statusCounts.DRAFT ?? 0,
                    NEEDS_REVIEW: statusCounts.NEEDS_REVIEW ?? 0,
                    PUBLISHED: statusCounts.PUBLISHED ?? 0,
                    REJECTED: statusCounts.REJECTED ?? 0,
                  },
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_review_queue": {
      const limit = typeof args?.limit === "number" ? args.limit : 20;

      const events = await prisma.riskEvent.findMany({
        where: { status: EventStatus.NEEDS_REVIEW },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          category: true,
          severity: true,
          confidence: true,
          country: true,
          city: true,
          createdAt: true,
          sourceUrl: true,
        },
      });

      return {
        content: [
          {
            type: "text",
            text:
              events.length === 0
                ? "Review queue is empty."
                : JSON.stringify(events, null, 2),
          },
        ],
      };
    }

    case "trigger_ingestion": {
      const { ingestRssSource } = await import("../lib/pipeline/rss.js");

      const sources = args?.sourceId
        ? await prisma.source.findMany({
            where: { id: String(args.sourceId), enabled: true },
          })
        : await prisma.source.findMany({ where: { enabled: true } });

      if (sources.length === 0) {
        return {
          content: [{ type: "text", text: "No enabled sources found." }],
        };
      }

      const results = [];
      for (const source of sources) {
        try {
          const result = await ingestRssSource(source.id);
          results.push({ sourceId: source.id, name: source.name, ok: true, result });
        } catch (error) {
          results.push({
            sourceId: source.id,
            name: source.name,
            ok: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("CID MCP server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
