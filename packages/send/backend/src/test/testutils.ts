export function shouldRunSuite(
  config: Record<string, string>,
  suiteName: string
) {
  // A suite can only run if every value it needs is actually present.
  // This is required even in CI: IS_CI_AUTOMATION being set does not mean the
  // suite's credentials are available (e.g. the Backblaze/S3 secrets may be
  // missing), so running anyway would fail against a nonexistent bucket.
  const canRun = Object.values(config).every((value) => !!value);
  if (!canRun) {
    console.warn(`env variables are not correctly set to run ${suiteName}`);
  }
  return canRun;
}
