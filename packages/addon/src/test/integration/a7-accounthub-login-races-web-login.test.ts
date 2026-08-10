/**
 * A7 — AccountHub-driven add-on login no longer races a concurrent
 * hamburger-menu web login for the same account: the OIDC_USER handler in
 * background.ts now drops a write when STORAGE_KEY_AUTH already holds a
 * session, preserving the first login instead of silently clobbering it.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #A7 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §A7.
 *
 * Mechanism that used to be under test (before the fix):
 *   - background.ts's initAccountHubListener() fires on
 *     browser.AccountHub.onAccountAdded, calling menuLoggedIn() then
 *     triggerAddonLogin({refresh_token: token}).
 *   - Independently, a "web" context (simulating the /addon-auth or a
 *     manually-opened login tab's auth-store) posts an OIDC_USER message
 *     that background's onMessage handler stored directly into
 *     STORAGE_KEY_AUTH with an unconditional browser.storage.local.set --
 *     no check for whether another login was already in progress for the
 *     same account.
 *   - There was no shared "login in progress" lock anywhere in either path.
 *
 * Fix: OIDC_USER handler now reads STORAGE_KEY_AUTH before writing; if it's
 * already populated, the incoming write is dropped (with a console.warn)
 * instead of silently overwriting the existing session. A genuine
 * re-auth would first clear STORAGE_KEY_AUTH via SIGN_OUT, which always
 * happens as part of any explicit logout flow.
 */
import { OIDC_USER } from '@send-frontend/lib/const';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('A7: concurrent OIDC_USER writes are rejected if STORAGE_KEY_AUTH already holds a session', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    teardownHost();
  });

  it('FIXED: the first OIDC_USER write wins; a concurrent second OIDC_USER is dropped to preserve the in-flight session', async () => {
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

    // FIX: the OIDC_USER handler now reads STORAGE_KEY_AUTH before
    // writing; the second OIDC_USER sees the AccountHub-driven session
    // already there and is dropped, preserving the in-flight session.
    const afterFlow2 = await bg.browser.storage.local.get('STORAGE_KEY_AUTH');
    expect(afterFlow2['STORAGE_KEY_AUTH'].refresh_token).toBe(
      'accounthub-session-token'
    );
    expect(afterFlow2['STORAGE_KEY_AUTH'].refresh_token).toBe(
      afterFlow1['STORAGE_KEY_AUTH'].refresh_token
    );
    expect(afterFlow2['STORAGE_KEY_AUTH'].refresh_token).not.toBe(
      'manual-web-login-session-token'
    );
  });
});
