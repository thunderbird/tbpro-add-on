/**
 * Maps `items` through `fn` with at most `limit` calls in flight, keeping the
 * input order in the result. Bounded so a cleanup batch cannot exhaust the
 * database connection pool.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    const i = next++;
    if (i >= items.length) return;
    results[i] = await fn(items[i]);
    return worker();
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
