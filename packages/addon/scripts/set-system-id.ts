import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

import { ADDON_ID_PROD, ADDON_ID_STAGE, ADDON_ID_SYSTEM } from '../src/addonIds';

/**
 * Rewrite a built add-on manifest's production id to the built-in/system add-on
 * id, in place. Used by CI when repacking the production XPI into the system
 * add-on XPI, so the system id is defined once (src/addonIds.ts) instead of being
 * hard-coded in a shell `sed`.
 *
 * Throws if the production id is not present, so a manifest that can't be
 * rewritten fails loudly instead of silently shipping a non-system XPI.
 *
 * `allowStage` relaxes this for local built-in testing only: a plain dev build
 * (scripts/build.sh with no NODE_ENV) copies the source public/manifest.json,
 * which carries the STAGE id, so the local `build:dev:system` flow has no PROD
 * id to rewrite. With `allowStage` the STAGE id is also accepted and a manifest
 * already on the system id is a no-op (dev rebuilds re-run this). CI never sets
 * it, so the prod-XPI repack keeps its strict PROD-only guard.
 *
 * Usage: bun run scripts/set-system-id.ts <path/to/manifest.json> [--allow-stage]
 * Defaults to this package's public/manifest.json when no path is given.
 */
export function setSystemId(
  manifestPath: string,
  { allowStage = false }: { allowStage?: boolean } = {}
): void {
  const before = fs.readFileSync(manifestPath, 'utf8');
  let after = before
    .split(`"id": "${ADDON_ID_PROD}"`)
    .join(`"id": "${ADDON_ID_SYSTEM}"`);
  if (allowStage) {
    after = after
      .split(`"id": "${ADDON_ID_STAGE}"`)
      .join(`"id": "${ADDON_ID_SYSTEM}"`);
  }

  if (after === before) {
    // Local dev rebuilds re-run this on a dist manifest that may already carry
    // the system id; treat that as success rather than failing the build.
    if (allowStage && before.includes(`"id": "${ADDON_ID_SYSTEM}"`)) {
      console.log(`Manifest ${manifestPath} already on the system add-on id`);
      return;
    }
    const ids = allowStage
      ? `prod id "${ADDON_ID_PROD}" or stage id "${ADDON_ID_STAGE}"`
      : `prod id "${ADDON_ID_PROD}"`;
    throw new Error(
      `Could not find ${ids} in ${manifestPath}; ` +
        `manifest not rewritten to the system add-on id.`
    );
  }

  fs.writeFileSync(manifestPath, after, 'utf8');
  console.log(`Set system add-on id (${ADDON_ID_SYSTEM}) in ${manifestPath}`);
}

// CLI entry — runs only when this file is invoked directly (e.g. `bun run
// scripts/set-system-id.ts ...`), not when imported by the unit tests.
function isInvokedDirectly(): boolean {
  return (
    !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

if (isInvokedDirectly()) {
  const cliArgs = process.argv.slice(2);
  const allowStage = cliArgs.includes('--allow-stage');
  const manifestPath =
    cliArgs.find((arg) => !arg.startsWith('--')) ??
    path.resolve(__dirname, '../public/manifest.json');
  try {
    setSystemId(manifestPath, { allowStage });
  } catch (error) {
    console.error('Failed to set system add-on id:', error);
    process.exit(1);
  }
}
