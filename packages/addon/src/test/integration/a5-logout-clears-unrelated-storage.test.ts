/**
 * A5 — `menuLogout()`'s blanket `storage.local.clear()` collateral damage.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #A5 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §A5.
 *
 * Mechanism under test (menu.ts, menuLogout()):
 *   await browser.storage.local.clear();
 *
 * This unconditional, blanket clear lives in the same browser.storage.local
 * namespace as unrelated in-flight staged data:
 *   - PENDING_ADDON_TOKEN (background.ts's triggerAddonLogin() staging key
 *     for an AccountHub-driven login in progress)
 *   - SEND_MESSAGE_TO_BRIDGE (a passphrase staged for the bridge handoff)
 *
 * This test drives the real `menuLogout()` against the fake host's shared
 * storage and proves that BOTH of those unrelated keys are destroyed by a
 * logout that has nothing to do with them, with no error surfaced to
 * whichever flow was relying on them.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('A5: menuLogout() blanket storage.local.clear() wipes unrelated in-flight data', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    teardownHost();
  });

  it('CONFIRMED BUG: a concurrent AccountHub login and bridged passphrase are silently destroyed by an unrelated logout', async () => {
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

    // THE BUG: menuLogout() calls browser.storage.local.clear() -- a
    // blanket wipe, not scoped to STORAGE_KEY_AUTH -- so all three unrelated
    // keys are silently destroyed with no error surfaced to either the
    // AccountHub login flow or the passphrase bridge handoff.
    const after = await ctx.browser.storage.local.get([
      'tbpro-pending-addon-token',
      'SEND_MESSAGE_TO_BRIDGE',
      'account-123',
    ]);
    expect(after['tbpro-pending-addon-token']).toBeUndefined();
    expect(after['SEND_MESSAGE_TO_BRIDGE']).toBeUndefined();
    expect(after['account-123']).toBeUndefined();

    // Confirm this was via the blanket clear() call specifically (not a
    // scoped set of individual remove() calls for an allow-list), which is
    // exactly the fix target identified in the bug report.
    expect(ctx.browser.storage.local.clear).toHaveBeenCalledTimes(1);
  });
});
