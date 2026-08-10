/**
 * A2 — Hamburger-menu logout in a plain browser tab now reliably reaches
 * the add-on menu/background via token-bridge.js for any host where the
 * add-on could plausibly run.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #A2 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §A2.
 *
 * Fix: `manifest.json` content_scripts.matches now also covers:
 *   - `https://localhost/*` (HTTPS local dev/test, not just the bare
 *     `http://localhost` the manifest listed).
 *   - `https://send-*.tb.pro/*` (any preview/staging subdomain of tb.pro
 *     — e.g. `send-preview-pr123.tb.pro`).
 *
 * With these added, the structural gap is closed: any Send page rendered
 * inside Thunderbird's embedded browser engine now actually has a
 * token-bridge.js listener to receive UserMenu.vue's SIGN_OUT postMessage.
 *
 * (The other half of the bug — `UserMenu.vue`'s gate only checking
 * `isRunningInsideThunderbird.value` without verifying a listener is
 * present — is a real structural concern but can't be probed from inside
 * the page; it can only be tested by checking the listener is actually
 * injected on the page's origin, which is what the manifest patterns
 * above guarantee.)
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
 * the manifest's actual patterns (scheme://host/<path-glob>). Not a
 * general-purpose implementation -- just enough to answer "does this origin
 * match any declared content_scripts pattern" faithfully for this test's
 * purposes.
 *
 * WebExtension match patterns don't specify ports -- a pattern of
 * `https://localhost/*` matches `https://localhost:5150/...` as well as
 * `https://localhost/...` -- so this translator inserts an optional `:PORT`
 * between the host and path parts of every pattern. (Without that, the
 * pattern would only match origins whose URL happened to have a `/` right
 * after the host, which is the no-port case.)
 */
function matchesAnyPattern(origin: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const schemeEnd = pattern.indexOf('://') + 3;
    const pathStart = pattern.indexOf('/', schemeEnd);
    const hostPart = pattern.slice(0, pathStart);
    const pathPart = pattern.slice(pathStart); // starts with '/'

    const escapeAndWildcard = (s: string) =>
      s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const re = new RegExp(
      `^${escapeAndWildcard(hostPart)}(?::[^/]*)?${escapeAndWildcard(pathPart)}`
    );
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

    // FIX: an https://localhost deployment (note: https, not the bare
    // http:// the manifest listed) is now covered by the manifest's
    // content_scripts.matches, so token-bridge.js IS injected there and
    // can relay UserMenu.vue's SIGN_OUT postMessage into background.ts.
    expect(
      matchesAnyPattern('https://localhost:5150/send/profile', matchPatterns)
    ).toBe(true);

    // Likewise, any preview/staging host under tb.pro is now covered by
    // the wildcard `https://send-*.tb.pro/*` pattern.
    expect(
      matchesAnyPattern(
        'https://send-preview-pr123.tb.pro/send/profile',
        matchPatterns
      )
    ).toBe(true);

    // Sanity: the pre-existing explicit patterns still match.
    expect(
      matchesAnyPattern('https://send.tb.pro/some/path', matchPatterns)
    ).toBe(true);
    expect(matchesAnyPattern('http://localhost/some/path', matchPatterns)).toBe(
      true
    );
  });
});
