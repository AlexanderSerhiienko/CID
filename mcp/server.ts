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
    {
      name: "explain_event_signals",
      description:
        "Returns the full pipeline signals array for a RiskEvent — every factor that influenced its severity, confidence, and auto-publish decision. Use this to understand WHY an event scored the way it did, or to decide whether to approve/reject it in the review queue.",
      inputSchema: {
        type: "object",
        required: ["eventId"],
        properties: {
          eventId: {
            type: "string",
            description: "The RiskEvent ID to explain.",
          },
        },
      },
    },
    {
      name: "suggest_source_trust_score",
      description:
        "Analyzes the historical performance of a source (how many of its events were auto-published, approved, rejected, or remain in review) and suggests a new trustScore with reasoning. Use this to tune source trust scores based on real data rather than guessing.",
      inputSchema: {
        type: "object",
        required: ["sourceId"],
        properties: {
          sourceId: {
            type: "string",
            description: "The Source ID to analyze.",
          },
        },
      },
    },
    {
      name: "bulk_reject_low_confidence",
      description:
        "Rejects all NEEDS_REVIEW events with confidence below a given threshold. Returns a list of rejected event IDs and titles. Use this to clear the review queue of noise — events the pipeline flagged as uncertain.",
      inputSchema: {
        type: "object",
        required: ["maxConfidence"],
        properties: {
          maxConfidence: {
            type: "number",
            description: "Reject events with confidence strictly below this value (e.g. 0.4).",
          },
          dryRun: {
            type: "boolean",
            description: "If true, return what would be rejected without making changes. Default: false.",
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

    case "explain_event_signals": {
      const eventId = String(args?.eventId ?? "");
      if (!eventId) {
        return { content: [{ type: "text", text: "eventId is required." }] };
      }

      const event = await prisma.riskEvent.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          title: true,
          category: true,
          severity: true,
          confidence: true,
          locationConfidence: true,
          status: true,
          country: true,
          city: true,
          createdAt: true,
          signals: true,
        },
      });
      const firstArticle = event
        ? await prisma.rawArticle.findFirst({
            where: { riskEventId: eventId },
            orderBy: { createdAt: "asc" },
            select: { source: { select: { name: true, trustScore: true, type: true } } },
          })
        : null;

      if (!event) {
        return { content: [{ type: "text", text: `No event found with ID: ${eventId}` }] };
      }

      const signals = Array.isArray(event.signals) ? event.signals : [];
      const signalSummary = signals.length === 0
        ? "No signals recorded (event may have been created before signal tracking was added)."
        : signals.map((s) => {
            const sig = s as Record<string, unknown>;
            return `[${String(sig.kind ?? "?").toUpperCase()}] ${sig.label} — ${sig.detail} (weight: ${sig.weight})`;
          }).join("\n");

      const firstSource = firstArticle?.source ?? null;

      const output = {
        event: {
          id: event.id,
          title: event.title,
          status: event.status,
          category: event.category,
          severity: event.severity,
          confidence: Math.round((event.confidence ?? 0) * 100) / 100,
          locationConfidence: Math.round((event.locationConfidence ?? 0) * 100) / 100,
          country: event.country,
          city: event.city,
          source: firstSource,
          createdAt: event.createdAt,
        },
        signals: signalSummary,
        signalCount: signals.length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      };
    }

    case "suggest_source_trust_score": {
      const sourceId = String(args?.sourceId ?? "");
      if (!sourceId) {
        return { content: [{ type: "text", text: "sourceId is required." }] };
      }

      const source = await prisma.source.findUnique({
        where: { id: sourceId },
        select: { id: true, name: true, trustScore: true, type: true },
      });

      if (!source) {
        return { content: [{ type: "text", text: `No source found with ID: ${sourceId}` }] };
      }

      // RiskEvent doesn't have a direct sourceId — link goes through rawArticles.
      // We count distinct RiskEvents that have at least one rawArticle from this source.
      const eventIds = await prisma.rawArticle.findMany({
        where: { sourceId, riskEventId: { not: null } },
        select: { riskEventId: true },
        distinct: ["riskEventId"],
      });
      const riskEventIds = eventIds.map((r) => r.riskEventId as string);

      const eventCounts = await prisma.riskEvent.groupBy({
        by: ["status"],
        where: { id: { in: riskEventIds } },
        _count: { id: true },
      });

      const counts = Object.fromEntries(
        eventCounts.map((row) => [row.status, row._count?.id ?? 0])
      );
      const published = counts.PUBLISHED ?? 0;
      const rejected = counts.REJECTED ?? 0;
      const needsReview = counts.NEEDS_REVIEW ?? 0;
      const total = published + rejected + needsReview + (counts.DRAFT ?? 0);

      if (total === 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              source: { id: source.id, name: source.name, currentTrustScore: source.trustScore },
              verdict: "Not enough data — no events ingested from this source yet.",
            }, null, 2),
          }],
        };
      }

      const approvalRate = published + rejected > 0 ? published / (published + rejected) : null;
      const currentScore = source.trustScore;
      let suggestedScore = currentScore;
      let reasoning = "";

      if (approvalRate === null || published + rejected < 5) {
        reasoning = `Only ${published + rejected} reviewed events — need at least 5 to make a reliable suggestion. Current score retained.`;
      } else if (approvalRate >= 0.9) {
        suggestedScore = Math.min(1.0, currentScore + 0.1);
        reasoning = `${Math.round(approvalRate * 100)}% approval rate across ${published + rejected} reviewed events. Source is highly reliable — suggest increasing trust score.`;
      } else if (approvalRate >= 0.7) {
        suggestedScore = currentScore;
        reasoning = `${Math.round(approvalRate * 100)}% approval rate. Source is performing well — current score is appropriate.`;
      } else if (approvalRate >= 0.5) {
        suggestedScore = Math.max(0.1, currentScore - 0.1);
        reasoning = `${Math.round(approvalRate * 100)}% approval rate. Moderate quality — suggest lowering trust score slightly to reduce noise reaching auto-publish.`;
      } else {
        suggestedScore = Math.max(0.1, currentScore - 0.2);
        reasoning = `${Math.round(approvalRate * 100)}% approval rate — high rejection rate. Source is noisy. Suggest significant trust score reduction.`;
      }

      if (needsReview > published + rejected) {
        reasoning += ` Note: ${needsReview} events still in NEEDS_REVIEW — approval rate may shift once reviewed.`;
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            source: { id: source.id, name: source.name, type: source.type, currentTrustScore: currentScore },
            stats: { total, published, rejected, needsReview, approvalRate },
            suggestion: {
              suggestedTrustScore: Math.round(suggestedScore * 100) / 100,
              changed: suggestedScore !== currentScore,
              reasoning,
            },
          }, null, 2),
        }],
      };
    }

    case "bulk_reject_low_confidence": {
      const maxConfidence = typeof args?.maxConfidence === "number" ? args.maxConfidence : null;
      if (maxConfidence === null || maxConfidence <= 0 || maxConfidence >= 1) {
        return { content: [{ type: "text", text: "maxConfidence must be a number between 0 and 1 (exclusive)." }] };
      }

      const dryRun = args?.dryRun === true;

      const candidates = await prisma.riskEvent.findMany({
        where: {
          status: EventStatus.NEEDS_REVIEW,
          confidence: { lt: maxConfidence },
        },
        select: { id: true, title: true, confidence: true, category: true, country: true },
        orderBy: { confidence: "asc" },
      });

      if (candidates.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No NEEDS_REVIEW events found with confidence < ${maxConfidence}.`,
          }],
        };
      }

      let actualCount = candidates.length;
      if (!dryRun) {
        const { count } = await prisma.riskEvent.updateMany({
          where: {
            id: { in: candidates.map((e) => e.id) },
            status: EventStatus.NEEDS_REVIEW,
          },
          data: { status: EventStatus.REJECTED },
        });
        actualCount = count;
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            dryRun,
            action: dryRun ? "Would reject" : "Rejected",
            count: actualCount,
            threshold: maxConfidence,
            events: candidates.map((e) => ({
              id: e.id,
              title: e.title,
              confidence: Math.round((e.confidence ?? 0) * 100) / 100,
              category: e.category,
              country: e.country,
            })),
          }, null, 2),
        }],
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
