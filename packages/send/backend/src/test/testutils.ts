/**
 * For suites that talk to a real bucket. A presigned round trip is a handful of
 * HTTP requests, and vitest's 5s default sits inside the noise band of a cold
 * container or a slow runner — a timeout there reads as a product failure.
 */
export const NETWORK_TEST_TIMEOUT_MS = 30_000;

/**
 * Is there an S3-compatible bucket service listening at `endpoint`?
 *
 * Used to skip the storage round-trip suite on a machine that has not started
 * one, without letting it skip silently in CI — see the caller.
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

export function shouldRunSuite(
  config: Record<string, string>,
  suiteName: string
) {
  if (process.env.IS_CI_AUTOMATION) return true;
  const canRun = Object.values(config).every((value) => !!value);
  if (!canRun) {
    console.warn(`env variables are not correctly set to run ${suiteName}`);
  }
  return canRun;
}
