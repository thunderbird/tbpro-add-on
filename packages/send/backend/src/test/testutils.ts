/**
 * For suites that talk to a real bucket. A presigned round trip is a handful of
 * HTTP requests, and vitest's 5s default sits inside the noise band of a cold
 * container or a slow runner — a timeout there reads as a product failure.
 */
export const NETWORK_TEST_TIMEOUT_MS = 30_000;

/**
 * Is there an S3-compatible bucket service listening at `endpoint`?
 *
 * The storage round-trip suite requires one. This exists so a machine that has
 * not started it gets a one-line answer instead of an SDK retry timeout.
 */
export async function isMinioReachable(
  endpoint: string,
  timeoutMs = 2000
): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    // MinIO's unauthenticated liveness probe. Any answer proves something is
    // listening and speaking HTTP, which is all we need to decide to run.
    const response = await fetch(`${endpoint}/minio/health/live`, {
      signal: abort.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
