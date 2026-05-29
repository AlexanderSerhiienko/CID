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
    concurrency: 2
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
