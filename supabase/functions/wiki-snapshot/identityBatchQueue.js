// Bounded concurrent reads for wiki-snapshot's full title-identity resolution.
// Preserve the original batch order and all results. No link cap or early exit.
export const WIKI_IDENTITY_BATCH_CONCURRENCY = 3;

export async function mapWikiIdentityBatchesOrdered(
  batches,
  worker,
  concurrency = WIKI_IDENTITY_BATCH_CONCURRENCY
) {
  if (!Array.isArray(batches) || typeof worker !== "function") {
    throw new TypeError("Expected batches array and async worker");
  }
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 3) {
    throw new RangeError("Wiki identity concurrency must be 1..3");
  }
  const results = new Array(batches.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < batches.length) {
      const index = nextIndex++;
      results[index] = await worker(batches[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, () => runWorker())
  );
  return results;
}
