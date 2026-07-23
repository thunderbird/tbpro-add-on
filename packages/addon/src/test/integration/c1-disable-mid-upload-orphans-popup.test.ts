/**
 * C1 [HIGH] — Add-on disabled mid-upload orphans the popup window and any
 * in-flight `uploadPromiseMap` entries with no cleanup.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #C1 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §C1.
 *
 * Mechanism under test: this is fundamentally an ABSENCE-of-code finding —
 * there is no `browser.runtime.onSuspend`, `browser.management.onDisabled`,
 * or `browser.management.onEnabled` listener registered ANYWHERE in either
 * package's source. Confirmed originally via
 * `grep -rn "onSuspend|onDisabled|onEnabled" packages/addon/src
 * packages/send/frontend/src` returning zero matches.
 *
 * A live-timing fake-host interaction test isn't the right tool for proving
 * an absence — this spec instead structurally re-verifies the same zero-
 * matches claim directly against the real source on every CI run (matching
 * A2/A6's structural-scan style in this same directory), so it fails loudly
 * the moment someone adds a disable/suspend lifecycle hook without wiring
 * up the corresponding queue/popup cleanup this finding calls for.
 *
 * Also confirms the corollary: `menuLogout()`'s `closeAllAddOnTabs()` (the
 * ONLY tab-cleanup code in this codebase) is reachable exclusively via the
 * `LOGOUT` menu click and the `SIGN_OUT` message handler — never from any
 * disable/uninstall lifecycle path — because no such path exists to call it
 * from.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDON_ROOT } from './testHelpers';

const ADDON_SRC = resolve(ADDON_ROOT, 'src');
const SEND_FRONTEND_SRC = resolve(ADDON_ROOT, 'node_modules/send-frontend/src');

// Word-boundary regexes scoped to the actual WebExtension lifecycle APIs
// this finding is about (browser.runtime.onSuspend,
// browser.management.onDisabled/onEnabled). Plain substring search on
// 'onDisabled' produces false positives -- e.g. Vue prop names like
// "primaryButtonDisabled" contain "onDisabled" as a substring
// ("Butt-on-Disabled"). Require a `.` or start-of-identifier immediately
// before, matching how these WebExtension APIs are actually referenced in
// source (`browser.runtime.onSuspend`, `.onDisabled.addListener`, etc.).
const LIFECYCLE_HOOK_PATTERNS = [
  /(?<![A-Za-z])onSuspend\b/,
  /(?<![A-Za-z])onDisabled\b/,
  /(?<![A-Za-z])onEnabled\b/,
];

/** Recursively collect .ts/.js/.vue source file paths, skipping test/node_modules dirs. */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'test' || entry === 'dist') {
        continue;
      }
      collectSourceFiles(full, out);
    } else if (/\.(ts|js|vue)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('C1: no add-on disable/suspend lifecycle hook exists anywhere in this codebase', () => {
  it('CONFIRMED BUG: zero matches for onSuspend/onDisabled/onEnabled across addon + send-frontend source', () => {
    const files = [
      ...collectSourceFiles(ADDON_SRC),
      ...collectSourceFiles(SEND_FRONTEND_SRC),
    ];
    expect(files.length).toBeGreaterThan(10); // sanity: we actually scanned real source

    const matches: Array<{ file: string; pattern: string }> = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of LIFECYCLE_HOOK_PATTERNS) {
        if (pattern.test(content)) {
          matches.push({ file, pattern: String(pattern) });
        }
      }
    }

    // THE BUG: no lifecycle hook exists to react to the add-on being
    // disabled, so a popup window and any pending uploadPromiseMap entries
    // are orphaned with no cleanup if disable happens mid-upload.
    expect(matches).toEqual([]);
  });

  it('CONFIRMED: closeAllAddOnTabs() (the only tab-cleanup code) is reachable only from menuLogout(), never from a disable path', () => {
    const menuTsPath = resolve(ADDON_SRC, 'menu.ts');
    const menuSource = readFileSync(menuTsPath, 'utf-8');

    // closeAllAddOnTabs is defined once...
    const definitionCount = (
      menuSource.match(/function closeAllAddOnTabs/g) || []
    ).length;
    expect(definitionCount).toBe(1);

    // ...and called exactly once, from inside menuLogout() (the LOGOUT menu
    // click / SIGN_OUT message chokepoint) -- there is no second call site
    // that could be reached from a disable/suspend event, because no such
    // event handler exists in this file (or anywhere else, per the prior
    // test in this spec).
    const callCount = (menuSource.match(/await closeAllAddOnTabs\(\)/g) || [])
      .length;
    expect(callCount).toBe(1);
  });
});
