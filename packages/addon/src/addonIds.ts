/**
 * Single source of truth for the add-on's extension ids.
 *
 * The same add-on is shipped under three ids:
 *   - PROD   — the standalone production add-on (AMO/ATN, manual install).
 *   - STAGE  — the standalone staging add-on.
 *   - SYSTEM — the built-in (a.k.a. system) add-on bundled into Thunderbird and
 *              enabled by default for every user. comm-central packaging
 *              rewrites the manifest id to this when extracting the build.
 *
 * This module has no runtime dependencies so it can be imported both by the
 * extension bundle (e.g. installGate.ts, selfUninstall.ts) and by the
 * build/packaging scripts (scripts/config.ts, scripts/set-system-id.ts) — so the
 * ids never have to be hard-coded in more than one place, including CI.
 */
export const ADDON_ID_PROD = 'tbpro-add-on@thunderbird.net';
export const ADDON_ID_STAGE = 'tbpro-addon-stage@thunderbird.net';
export const ADDON_ID_SYSTEM = 'tbpro-system-add-on@thunderbird.net';
