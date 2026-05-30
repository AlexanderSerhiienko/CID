import { ingestRssSource } from "./rss";

type IngestResult = Awaited<ReturnType<typeof ingestRssSource>>;

type QueueItem = {
  sourceId: string;
  resolve: (result: IngestResult) => void;
  reject: (err: unknown) => void;
};

// Module-level chain — all ingest calls go through this single Promise sequence.
// Ensures only one ingestRssSource runs at a time so Groq rate limiting is respected
// when multiple API requests arrive concurrently (within the same process).
let chain: Promise<void> = Promise.resolve();
const pending: QueueItem[] = [];

function drainNext() {
  const item = pending.shift();
  if (!item) return;

  chain = chain
    .then(() => ingestRssSource(item.sourceId))
    .then(item.resolve, item.reject)
    .finally(drainNext);
}

export function enqueueIngest(sourceId: string): Promise<IngestResult> {
  return new Promise<IngestResult>((resolve, reject) => {
    const wasEmpty = pending.length === 0;
    pending.push({ sourceId, resolve, reject });
    if (wasEmpty) drainNext();
  });
}
