/**
 * A5 — `menuLogout()` must fully wipe the add-on's storage on logout.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #A5,
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §A5, and #1054.
 *
 * Product requirement: a genuine logout (from the menu OR the web app inside
 * Thunderbird) returns the add-on to a clean, logged-out state -- the auth
 * token, the staged passphrase, and ALL other add-on data are gone, so the
 * next launch requires a fresh login.
 *
 * browser.storage.local is namespaced PER-EXTENSION (keyed to this add-on's
 * gecko id); it is NOT shared with Thunderbird core or any other add-on. Every
 * key in it is TB-Send's own, so a blanket clear() only ever touches TB-Send
 * data -- which is exactly what "clean wipe" wants. A scoped single-key
 * remove() would leak the passphrase (SEND_MESSAGE_TO_BRIDGE) and a live
 * refresh token (PENDING_ADDON_TOKEN) past logout.
 *
 * A concurrent in-flight login (PENDING_ADDON_TOKEN) is intentionally
 * cancelled by logout -- logout wins over a half-finished login by design.
 *
 * Mechanism under test (menu.ts, menuLogout()):
 *   await browser.storage.local.clear();
 *
 * This spec asserts that a logout leaves NOTHING behind in storage.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('A5: menuLogout() must fully wipe add-on storage to a clean logged-out state', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    teardownHost();
  });

  it('FULL WIPE: auth token, staged passphrase, pending login token, and account config are ALL cleared on logout', async () => {
    const ctx = stubContext(host);
    const { menuLogout } = await import('../../menu');

    // Seed the storage with a representative spread of the add-on's own keys,
    // matching what background.ts / auth-store.ts / extension-store.ts write:
    //   - the auth session
    //   - a staged passphrase (bridge handoff) -- security-sensitive
    //   - a pending OIDC token set (in-flight add-on login) -- a refresh token
    //   - a per-account cloud-file server config
    await ctx.browser.storage.local.set({
      'send-auth': { some: 'auth-session' },
      SEND_MESSAGE_TO_BRIDGE: 'staged-passphrase-words',
      'tbpro-pending-addon-token': { refresh_token: 'staged-refresh-token' },
      'account-123': { server: 'https://send.tb.pro' },
    });

    // Sanity: everything is present before logout.
    const before = await ctx.browser.storage.local.get([
      'send-auth',
      'SEND_MESSAGE_TO_BRIDGE',
      'tbpro-pending-addon-token',
      'account-123',
    ]);
    expect(before['send-auth']).toBeDefined();
    expect(before['SEND_MESSAGE_TO_BRIDGE']).toBeDefined();
    expect(before['tbpro-pending-addon-token']).toBeDefined();
    expect(before['account-123']).toBeDefined();

    // A genuine logout (LOGOUT menu action / SIGN_OUT message).
    await menuLogout();

    // FULL WIPE: nothing the add-on owns survives the logout. The passphrase
    // and the refresh token in particular must NOT leak past sign-out.
    const after = await ctx.browser.storage.local.get([
      'send-auth',
      'SEND_MESSAGE_TO_BRIDGE',
      'tbpro-pending-addon-token',
      'account-123',
    ]);
    expect(after['send-auth']).toBeUndefined();
    expect(after['SEND_MESSAGE_TO_BRIDGE']).toBeUndefined();
    expect(after['tbpro-pending-addon-token']).toBeUndefined();
    expect(after['account-123']).toBeUndefined();

    // Confirm the wipe was via the blanket clear() -- the correct mechanism
    // for a "return to clean state" logout, since storage.local is
    // per-extension isolated (see #1054).
    expect(ctx.browser.storage.local.clear).toHaveBeenCalledTimes(1);
  });
});
