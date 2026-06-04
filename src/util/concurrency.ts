/**
 * Maps over `items` running at most `limit` invocations of `fn` at the same
 * time, returning results in input order. A non-positive or invalid `limit`
 * falls back to 1 (sequential) so a misconfigured cap never stalls the pool.
 *
 * Rejections from `fn` propagate — callers that must not fail the whole batch
 * (e.g. per-post vision analysis) should catch inside `fn` and return a
 * sentinel value instead.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const max = Math.max(1, Math.floor(limit) || 1);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  };

  const poolSize = Math.min(max, items.length);
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return results;
}
