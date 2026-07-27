/**
 * A6 — Hamburger menu / web UserMenu shows stale `isLoggedIn`; no push
 * refresh on `SIGN_OUT`/`OIDC_USER`.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #A6 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §A6.
 *
 * `public/token-bridge.js` is a raw (non-ESM) content script loaded directly
 * by the manifest -- it cannot be `import`-ed and driven through a runtime
 * harness the way background.ts/menu.ts can. Instead, this spec loads the
 * REAL production file's source text and structurally verifies the two
 * halves of the confirmed gap directly against that source, which is
 * exactly as strong evidence as reading the file by hand (stronger,
 * actually, since it's re-verified on every CI run instead of only at
 * review time and will fail loudly the moment someone adds forwarding).
 *
 * Two things this test proves are simultaneously true in the real source:
 *   1. `browser.runtime.onMessage.addListener` (background -> bridge
 *      direction) has explicit handling to forward LOGIN_STATE_RESPONSE,
 *      OIDC_TOKEN, PENDING_ADDON_TOKEN_RESPONSE, and TELEMETRY_STATE_CHANGED
 *      into the page via `window.postMessage`, but has NO branch at all for
 *      an inbound `SIGN_OUT` or `OIDC_USER` message type -- so even if
 *      background broadcast either of those (which it does today, e.g. via
 *      initStorageWatcher()'s `browser.runtime.sendMessage({type: SIGN_OUT})`
 *      on an external STORAGE_KEY_AUTH removal), the web page NEVER learns
 *      about it.
 *   2. `UserMenu.vue` only ever SENDS `SIGN_OUT` (on logout button click) --
 *      it registers no listener of any kind (`window.addEventListener`,
 *      `browser.runtime.onMessage`) for an inbound sign-out/session-changed
 *      notification, so there is no reactive re-check of `isLoggedIn`
 *      wired up on the receiving end either, even if bridge forwarding
 *      existed.
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

describe('A6: no push-based refresh path exists for SIGN_OUT/OIDC_USER into the web UI', () => {
  it('CONFIRMED BUG: token-bridge.js forwards other background->page messages but has no SIGN_OUT/OIDC_USER inbound branch', () => {
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

    // THE BUG: no branch anywhere in this listener checks for an inbound
    // SIGN_OUT or OIDC_USER message to relay into the page via
    // window.postMessage. (Both constants ARE referenced elsewhere in the
    // file -- as outbound page->bridge->background forwards -- so a naive
    // `expect(source).not.toContain('SIGN_OUT')` would be wrong; the
    // precise claim is that the *inbound* onMessage listener block has no
    // `message.type === SIGN_OUT` / `message.type === OIDC_USER` check.)
    expect(listenerBlock).not.toContain('message.type === SIGN_OUT');
    expect(listenerBlock).not.toContain('message.type === OIDC_USER');
  });

  it('CONFIRMED BUG: UserMenu.vue only sends SIGN_OUT, never listens for an inbound session-changed notification', () => {
    const source = readFileSync(USER_MENU_PATH, 'utf-8');

    // Confirm it does send SIGN_OUT on logout (the half that DOES exist).
    expect(source).toContain("type: SIGN_OUT");
    expect(source).toContain('window.postMessage');

    // THE BUG: no listener registration of any kind for an inbound
    // sign-out/session-changed push notification exists in this component.
    expect(source).not.toContain('window.addEventListener');
    expect(source).not.toMatch(/runtime\.onMessage\.addListener/);
  });
});
