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

