/**
 * Runs `fn` over `items`, at most `limit` at a time, and returns results in
 * the same order as `items`. Used for thumbnail generation across a list of
 * documents/pages - firing all of them at once (`Promise.all`) would hand
 * the native image module dozens of concurrent full-size decodes; running
 * them one at a time would make a big document list slow to finish loading
 * thumbnails. A small pool gets the throughput without the memory spike.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) {
        return;
      }
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({length: Math.min(limit, items.length)}, worker);
  await Promise.all(workers);
  return results;
}
