/**
 * A2 — Hamburger-menu logout in a plain browser tab doesn't reach the add-on
 * menu/background if the token-bridge content script isn't injected on that
 * origin.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #A2 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §A2.
 *
 * Mechanism under test:
 *   - `isThunderbirdHost` (config-store.ts) is a plain
 *     `navigator.userAgent.includes('Thunderbird')` check -- true for ANY
 *     page rendered inside Thunderbird's embedded browser engine, on ANY
 *     origin.
 *   - `manifest.json`'s content_scripts only injects token-bridge.js on
 *     `https://send.tb.pro/*`, `https://send-stage.tb.pro/*`, and
 *     `http://localhost/*` -- NOT on `https://localhost/*`, not on
 *     `127.0.0.1`, and not on any other deployed host.
 *   - `UserMenu.vue`'s `handleLogout()` gates the `SIGN_OUT`
 *     `window.postMessage()` purely on `isRunningInsideThunderbird.value`
 *     (which maps 1:1 to `isThunderbirdHost`), with NO check that a
 *     token-bridge listener is actually present to receive it.
 *
 * This test proves the structural gap two ways:
 *   1. Real `useConfigStore().isThunderbirdHost` returns true for a Send
 *      page origin that the manifest's content_scripts glob does NOT match
 *      (demonstrated for `https://localhost:5150` -- https, not the bare
 *      `http://localhost` the manifest lists -- and for an arbitrary staging
 *      host that isn't `send.tb.pro`/`send-stage.tb.pro`).
 *   2. The real `manifest.json`'s content_scripts.matches array, parsed
 *      directly, does not include a pattern matching that same origin.
 * Combined, these prove UserMenu.vue's gate is checking the wrong thing:
 * being inside Thunderbird's engine is necessary but not sufficient for the
 * SIGN_OUT postMessage to have anyone listening on the other end.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigStore } from '@send-frontend/apps/send/stores/config-store';
import { ADDON_ROOT } from './testHelpers';

const MANIFEST_PATH = resolve(ADDON_ROOT, 'public/manifest.json');

/**
 * Minimal WebExtension match-pattern -> RegExp translator, sufficient for
 * the manifest's actual patterns (scheme://host/*). Not a general-purpose
 * implementation -- just enough to answer "does this origin match any
 * declared content_scripts pattern" faithfully for this test's purposes.
 */
function matchesAnyPattern(origin: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const re = new RegExp(`^${escaped}`);
    return re.test(origin + '/');
  });
}

describe('A2: token-bridge origin mismatch means logout never reaches the add-on', () => {
  const originalUA = navigator.userAgent;

  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      configurable: true,
    });
    vi.unstubAllGlobals();
  });

  function stubUserAgent(ua: string) {
    Object.defineProperty(navigator, 'userAgent', {
      value: ua,
      configurable: true,
    });
  }

  it('CONFIRMED BUG: isThunderbirdHost is true for a Send-app origin the manifest does NOT inject token-bridge.js on', () => {
    // Any page rendered inside Thunderbird's embedded browser engine has
    // "Thunderbird" in its UA string, regardless of which origin it is.
    stubUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Thunderbird/145.0'
    );

    const configStore = useConfigStore();
    expect(configStore.isThunderbirdHost).toBe(true);

    // Read the REAL manifest.json content_scripts.matches array.
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const contentScriptEntry = manifest.content_scripts?.find((cs: any) =>
      cs.js?.includes('token-bridge.js')
    );
    expect(contentScriptEntry).toBeDefined();
    const matchPatterns: string[] = contentScriptEntry.matches;

    // Sanity: confirm the manifest DOES cover the documented origins.
    expect(
      matchesAnyPattern('https://send.tb.pro/some/path', matchPatterns)
    ).toBe(true);
    expect(matchesAnyPattern('http://localhost/some/path', matchPatterns)).toBe(
      true
    );

    // THE BUG: an https://localhost deployment (note: https, not the bare
    // http:// the manifest lists) -- a perfectly plausible local dev/test
    // setup -- is NOT covered by the manifest's content_scripts.matches,
    // even though isThunderbirdHost is still true for it.
    expect(
      matchesAnyPattern('https://localhost:5150/send/profile', matchPatterns)
    ).toBe(false);

    // Likewise for any other staging/preview host that isn't exactly
    // send.tb.pro / send-stage.tb.pro.
    expect(
      matchesAnyPattern(
        'https://send-preview-pr123.tb.pro/send/profile',
        matchPatterns
      )
    ).toBe(false);

    // This is the precise gap: UserMenu.vue's handleLogout() only checks
    // isThunderbirdHost (true above) before posting SIGN_OUT via
    // window.postMessage -- it never checks whether a content-script
    // listener actually exists on the current origin (which the manifest
    // proves it does not, for these origins). The postMessage is posted
    // into a void with no token-bridge.js listener present to relay it to
    // background.ts, so the add-on silently remains logged in.
  });
});
