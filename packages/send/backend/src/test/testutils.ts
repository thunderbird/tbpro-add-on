export function shouldRunSuite(
  config: Record<string, string>,
  suiteName: string
) {
  // A suite can only run when every value it needs is actually present.
  // This is true even in CI: IS_CI_AUTOMATION being set does not mean the
  // suite's credentials are available (for example the Backblaze/S3 secrets
  // may be missing), so running anyway would fail against a bucket that does
  // not exist. When credentials are missing we skip the suite with a warning.
  const canRun = Object.values(config).every((value) => !!value);
  if (!canRun) {
    console.warn(`env variables are not correctly set to run ${suiteName}`);
  }
  return canRun;
}
