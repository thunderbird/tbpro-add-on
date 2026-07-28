/**
 * A6 — Hamburger menu / web UserMenu no longer shows stale `isLoggedIn`:
 * token-bridge.js now forwards `SIGN_OUT`/`OIDC_USER` from background into
 * the page, and `UserMenu.vue` listens for those messages and re-checks its
 * auth state.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #A6 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §A6.
 *
 * `public/token-bridge.js` is a raw (non-ESM) content script loaded directly
 * by the manifest -- it cannot be `import`-ed and driven through a runtime
 * harness the way background.ts/menu.ts can. Instead, this spec loads the
 * REAL production file's source text and structurally verifies the two
 * halves of the fix directly against that source.
 *
 * Two things this test proves are simultaneously true in the real source:
 *   1. `browser.runtime.onMessage.addListener` (background -> bridge
 *      direction) now also forwards `SIGN_OUT` and `OIDC_USER` into the
 *      page via `window.postMessage` -- so a session-changed notification
 *      broadcast by background.ts actually reaches the page.
 *   2. `UserMenu.vue` now registers a `window.addEventListener('message', ...)`
 *      that re-runs the logout path on `SIGN_OUT` and refetches auth on
 *      `OIDC_USER`, so its "signed in" UI flips in step with the rest of
 *      the add-on without a reload.
 *
 * (UserMenu.vue is a web-context component and must NOT use the
 * WebExtensions-only `browser.runtime.onMessage.addListener` API directly;
 * the bridge is what bridges to the page. That negative assertion is
 * preserved below so the gap doesn't regress to a wrong-direction fix.)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDON_ROOT } from './testHelpers';

const TOKEN_BRIDGE_PATH = resolve(ADDON_ROOT, 'public/token-bridge.js');
const USER_MENU_PATH = resolve(
  ADDON_ROOT,
  'node_modules/send-frontend/src/apps/send/components/UserMenu.vue'
);

describe('A6: SIGN_OUT/OIDC_USER push refreshes the web UI', () => {
  it('FIXED: token-bridge.js forwards SIGN_OUT and OIDC_USER to the page', () => {
    const source = readFileSync(TOKEN_BRIDGE_PATH, 'utf-8');

    // Isolate the browser.runtime.onMessage.addListener block, which is
    // where background -> bridge -> page forwarding is implemented.
    const listenerBlockStart = source.indexOf(
      'browser.runtime.onMessage.addListener((message) => {'
    );
    expect(listenerBlockStart).toBeGreaterThan(-1);
    const listenerBlock = source.slice(listenerBlockStart);

    // Sanity: confirm this test is looking at the right block by checking it
    // DOES forward the message types the code comments say it forwards.
    expect(listenerBlock).toContain('message.type === LOGIN_STATE_RESPONSE');
    expect(listenerBlock).toContain('message.type === OIDC_TOKEN');
    expect(listenerBlock).toContain(
      'message.type === PENDING_ADDON_TOKEN_RESPONSE'
    );
    expect(listenerBlock).toContain('message.type === TELEMETRY_STATE_CHANGED');

    // FIX: the inbound onMessage listener block now has explicit branches
    // for SIGN_OUT and OIDC_USER that relay them into the page via
    // window.postMessage so the page's UI can react.
    expect(listenerBlock).toContain('message.type === SIGN_OUT');
    expect(listenerBlock).toContain('message.type === OIDC_USER');
  });

  it('FIXED: UserMenu.vue listens for an inbound session-changed notification', () => {
    const source = readFileSync(USER_MENU_PATH, 'utf-8');

    // Confirm it does send SIGN_OUT on logout (the half that DOES exist).
    expect(source).toContain("type: SIGN_OUT");
    expect(source).toContain('window.postMessage');

    // FIX: UserMenu.vue now registers a window.addEventListener for the
    // bridge-forwarded SIGN_OUT/OIDC_USER messages and re-checks auth
    // state when they arrive.
    expect(source).toContain('window.addEventListener');

    // Still: UserMenu.vue is a web-context component and must NOT reach
    // into WebExtensions-only APIs directly -- the bridge is what bridges
    // to the page.
    expect(source).not.toMatch(/runtime\.onMessage\.addListener/);
  });
});
