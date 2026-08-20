/**
 * For the live bucket suites. Their round trips run 1.5-4.8s in CI, inside the
 * noise band of vitest's 5s default; a broken read or delete still fails on
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
