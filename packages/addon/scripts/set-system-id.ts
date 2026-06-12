import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

import { ADDON_ID_PROD, ADDON_ID_SYSTEM } from '../src/addonIds';

/**
 * Rewrite a built add-on manifest's production id to the built-in/system add-on
 * id, in place. Used by CI when repacking the production XPI into the system
 * add-on XPI, so the system id is defined once (src/addonIds.ts) instead of being
 * hard-coded in a shell `sed`.
 *
 * Throws if the production id is not present, so a manifest that can't be
 * rewritten fails loudly instead of silently shipping a non-system XPI.
 *
 * Usage: bun run scripts/set-system-id.ts <path/to/manifest.json>
 * Defaults to this package's public/manifest.json when no path is given.
 */
export function setSystemId(manifestPath: string): void {
  const before = fs.readFileSync(manifestPath, 'utf8');
  const after = before
    .split(`"id": "${ADDON_ID_PROD}"`)
    .join(`"id": "${ADDON_ID_SYSTEM}"`);

  if (after === before) {
    throw new Error(
      `Could not find prod id "${ADDON_ID_PROD}" in ${manifestPath}; ` +
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
  const manifestPath =
    process.argv[2] ?? path.resolve(__dirname, '../public/manifest.json');
  try {
    setSystemId(manifestPath);
  } catch (error) {
    console.error('Failed to set system add-on id:', error);
    process.exit(1);
  }
}
