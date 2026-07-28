/**
 * A5 — `menuLogout()`'s blanket `storage.local.clear()` collateral damage.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #A5 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §A5.
 *
 * Mechanism that used to be under test (menu.ts, menuLogout()):
 *   await browser.storage.local.clear();
 *
 * That unconditional blanket clear lived in the same browser.storage.local
 * namespace as unrelated in-flight staged data:
 *   - PENDING_ADDON_TOKEN (background.ts's triggerAddonLogin() staging key
 *     for an AccountHub-driven login in progress)
 *   - SEND_MESSAGE_TO_BRIDGE (a passphrase staged for the bridge handoff)
 *
 * The fix replaces the blanket clear with a scoped remove() targeting only
 * STORAGE_KEY_AUTH, so the unrelated in-flight keys SURVIVE an unrelated
 * logout. This spec asserts the FIXED behavior.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('A5: menuLogout() must scope its storage clear to STORAGE_KEY_AUTH only', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    teardownHost();
  });

  it('FIXED: a concurrent AccountHub login and bridged passphrase survive an unrelated logout', async () => {
    const ctx = stubContext(host);
    const { menuLogout } = await import('../../menu');

    // Simulate two unrelated flows mid-flight, both staging data in the
    // same browser.storage.local namespace menuLogout() will nuke:
    //   1. An AccountHub-driven login has staged a pending token set.
    //   2. A passphrase bridge handoff is staged, waiting to be consumed by
    //      restoreKeysUsingLocalStorage() in another context (popup/web).
    await ctx.browser.storage.local.set({
      'tbpro-pending-addon-token': {
        refresh_token: 'staged-refresh-token',
      },
      SEND_MESSAGE_TO_BRIDGE: 'staged-passphrase-words',
      // Also seed an unrelated per-account cloud-file server config key,
      // matching extension-store.ts's browser.storage.local.set({[id]: ...}).
      'account-123': { server: 'https://send.tb.pro' },
    });

    // Sanity: all three unrelated keys are present before logout.
    const before = await ctx.browser.storage.local.get([
      'tbpro-pending-addon-token',
      'SEND_MESSAGE_TO_BRIDGE',
      'account-123',
    ]);
    expect(before['tbpro-pending-addon-token']).toBeDefined();
    expect(before['SEND_MESSAGE_TO_BRIDGE']).toBeDefined();
    expect(before['account-123']).toBeDefined();

    // Now an unrelated logout happens (e.g. the user clicked Logout in the
    // hamburger menu, or a SIGN_OUT message arrived) while the above flows
    // are still mid-flight.
    await menuLogout();

    // FIX: menuLogout() now uses a scoped remove() targeting only
    // STORAGE_KEY_AUTH, so the three unrelated in-flight keys all SURVIVE
    // the logout that has nothing to do with them.
    const after = await ctx.browser.storage.local.get([
      'tbpro-pending-addon-token',
      'SEND_MESSAGE_TO_BRIDGE',
      'account-123',
    ]);
    expect(after['tbpro-pending-addon-token']).toBeDefined();
    expect(after['SEND_MESSAGE_TO_BRIDGE']).toBeDefined();
    expect(after['account-123']).toBeDefined();

    // Confirm no blanket clear() was used (the original bug mechanism) --
    // menuLogout() must use a scoped remove() targeting STORAGE_KEY_AUTH
    // specifically, not a wipe.
    expect(ctx.browser.storage.local.clear).not.toHaveBeenCalled();
  });
});
