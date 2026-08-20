/**
 * Vitest's 5s default is not enough for the live bucket suites. Every test in
 * them makes real round trips, and the delete tests make five (write, read,
 * list versions, delete, re-read). Observed suite durations in CI span
 * 1.5-4.8s, so the default sits inside the noise band and fails on a slow run.
 * Raising it weakens nothing: a genuinely broken read or delete still fails on
 * the assertion rather than the clock.
 */
export const NETWORK_TEST_TIMEOUT_MS = 30_000;

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
