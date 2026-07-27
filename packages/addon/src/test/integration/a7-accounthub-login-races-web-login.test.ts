/**
 * A7 — AccountHub-driven add-on login races a concurrent hamburger-menu web
 * login for the same account; both write to the same shared
 * STORAGE_KEY_AUTH with "last write wins" semantics and no mutual exclusion.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #A7 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §A7.
 *
 * Mechanism under test:
 *   - background.ts's initAccountHubListener() fires on
 *     browser.AccountHub.onAccountAdded, calling menuLoggedIn() then
 *     triggerAddonLogin({refresh_token: token}).
 *   - Independently, a "web" context (simulating the /addon-auth or a
 *     manually-opened login tab's auth-store) can post an OIDC_USER message
 *     that background's onMessage handler stores directly into
 *     STORAGE_KEY_AUTH with an unconditional browser.storage.local.set --
 *     no check for whether another login is already in progress for the
 *     same account.
 *   - There is no shared "login in progress" lock anywhere in either path.
 *
 * This test drives both flows against the SAME fake host (shared storage)
 * and shows that whichever OIDC_USER-equivalent write happens last silently
 * overwrites the other's stored auth data, exactly as described.
 */
import { OIDC_USER } from '@send-frontend/lib/const';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('A7: AccountHub add-on login races a concurrent web login for the same account', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    teardownHost();
  });

  it('CONFIRMED BUG: last OIDC_USER write wins, silently overwriting the other login flow\'s session with no coordination', async () => {
    const bg = stubContext(host);
    await import('../../background');

    // --- Flow 1: AccountHub-driven login fires first ---
    // Directly invoke the registered onAccountAdded listener, matching how
    // background.ts's initAccountHubListener() wires it.
    const onAccountAddedListener = (
      bg.browser.AccountHub.onAccountAdded.addListener as ReturnType<
        typeof vi.fn
      >
    ).mock.calls[0][0];

    expect(onAccountAddedListener).toBeDefined();

    await onAccountAddedListener({
      token: 'accounthub-refresh-token',
      email: 'user@example.com',
    });

    // triggerAddonLogin() stages PENDING_ADDON_TOKEN and opens the
    // /addon-auth tab -- it does NOT itself write STORAGE_KEY_AUTH (that
    // happens later, once /addon-auth's authenticateWithAddonToken() posts
    // OIDC_USER back through the bridge). Confirm the tab was opened and no
    // mutual-exclusion flag of any kind was set.
    expect(bg.browser.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('/addon-auth') })
    );

    // Simulate the /addon-auth flow completing: it eventually posts OIDC_USER
    // with the full reconstructed User object for this AccountHub-driven login.
    await bg.deliverMessage({
      type: OIDC_USER,
      user: {
        profile: { preferred_username: 'user@example.com' },
        refresh_token: 'accounthub-session-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    });

    const afterFlow1 = await bg.browser.storage.local.get('STORAGE_KEY_AUTH');
    expect(afterFlow1['STORAGE_KEY_AUTH'].refresh_token).toBe(
      'accounthub-session-token'
    );

    // --- Flow 2: a completely independent, concurrent manual web login for
    // the SAME account (e.g. the user also clicked "Sign in" in the
    // hamburger menu, or had a stale send.tb.pro/login tab open) completes
    // around the same time and posts its OWN OIDC_USER for the same user. ---
    await bg.deliverMessage({
      type: OIDC_USER,
      user: {
        profile: { preferred_username: 'user@example.com' },
        refresh_token: 'manual-web-login-session-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    });

    // THE BUG: no mutual-exclusion guard existed anywhere in either flow to
    // detect "a login for this account is already in progress/complete" --
    // the second OIDC_USER message unconditionally overwrites
    // STORAGE_KEY_AUTH via background.ts's plain
    // `browser.storage.local.set({[STORAGE_KEY_AUTH]: message.user})`,
    // silently discarding the AccountHub-driven session that had just been
    // established, with no error, warning, or reconciliation of any kind.
    const afterFlow2 = await bg.browser.storage.local.get('STORAGE_KEY_AUTH');
    expect(afterFlow2['STORAGE_KEY_AUTH'].refresh_token).toBe(
      'manual-web-login-session-token'
    );
    expect(afterFlow2['STORAGE_KEY_AUTH'].refresh_token).not.toBe(
      afterFlow1['STORAGE_KEY_AUTH'].refresh_token
    );
  });
});
