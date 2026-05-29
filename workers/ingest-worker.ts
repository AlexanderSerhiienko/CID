import { Worker } from "bullmq";
import { connection } from "@/lib/queue";
import { ingestRssSource } from "@/lib/pipeline/rss";

const worker = new Worker(
  "rss-ingestion",
  async (job) => {
    return ingestRssSource(job.data.sourceId);
  },
  {
    connection,
    // concurrency: 1 is required for correct cross-source deduplication.
    // With concurrency > 1, two source jobs run simultaneously — each builds
    // its own recentEvents snapshot and cannot see events created by the other,
    // causing duplicate RiskEvents for the same crisis from different sources.
    // Since jobs run in the background (no Vercel timeout), sequential processing
    // is acceptable: ~10 s per source × 10 sources = ~100 s, well within limits.
    concurrency: 1
  }
);

worker.on("completed", (job) => {
  console.log(`RSS ingestion job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(`RSS ingestion job ${job?.id ?? "unknown"} failed`, error);
});

// Graceful shutdown: let the current job finish before the process exits.
// Without this, docker stop / Kubernetes rolling deploy interrupts active jobs
// and they stay locked in BullMQ until the lock expires (lockDuration).
async function shutdown() {
  console.log("Ingest worker shutting down...");
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
