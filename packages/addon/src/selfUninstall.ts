/// <reference types="thunderbird-webext-browser" />

const DEPRECATION_ADDON_IDS = ['tbpro-addon-stage@thunderbird.net'];

/**
 * Compare two semver strings. Returns true if `a >= b`.
 * Handles standard MAJOR.MINOR.PATCH format.
 */
function semverGte(a: string, b: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [aMaj = 0, aMin = 0, aPatch = 0] = parse(a);
  const [bMaj = 0, bMin = 0, bPatch = 0] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPatch >= bPatch;
}

/**
 * On startup, checks whether this addon instance should uninstall itself.
 *
 * Uninstall conditions (all must be true):
 * 1. `VITE_DEPRECATION_VERSION` env var is set at build time.
 * 2. The running addon ID matches the designated stage ID.
 * 3. The Thunderbird (Gecko) version is >= the deprecation cutoff version.
 *
 * Production builds are unaffected because their addon ID differs.
 */
export async function checkAndUninstallIfDeprecated(): Promise<void> {
  const cutoffVersion = import.meta.env.VITE_DEPRECATION_VERSION;

  if (!cutoffVersion) {
    console.log(
      '[self-uninstall] VITE_DEPRECATION_VERSION not set — skipping.'
    );
    return;
  }

  const currentId = browser.runtime.id;
  if (!DEPRECATION_ADDON_IDS.includes(currentId)) {
    console.log(
      `[self-uninstall] Addon ID "${currentId}" does not match any deprecation ID — skipping.`
    );
    return;
  }

  const { version: geckoVersion } = await browser.runtime.getBrowserInfo();
  console.log(
    `[self-uninstall] Gecko version: ${geckoVersion}, cutoff: ${cutoffVersion}`
  );

  if (!semverGte(geckoVersion, cutoffVersion)) {
    console.log(
      `[self-uninstall] Version ${geckoVersion} is below cutoff ${cutoffVersion} — skipping.`
    );
    return;
  }

  console.warn(
    `[self-uninstall] Gecko ${geckoVersion} >= cutoff ${cutoffVersion} and ID matches — uninstalling addon.`
  );
  await browser.management.uninstallSelf({ showConfirmDialog: false });
}
