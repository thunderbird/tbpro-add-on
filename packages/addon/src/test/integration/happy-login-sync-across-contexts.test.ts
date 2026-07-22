/**
 * HAPPY PATH — a normal, uncontested OIDC login correctly syncs auth state
 * from the web tab into background's storage and out to the hamburger menu,
 * with no other login racing it. Correct-behavior counterpart to A7 (which
 * proves what happens when two logins for the same account race).
 *
 * Flow under test:
 *   web tab (token-bridge.js) posts OIDC_USER after handleOIDCCallback()
 *   -> background.ts's onMessage handler stores it under STORAGE_KEY_AUTH
 *      in the SHARED browser.storage.local
 *   -> menuLoggedIn() updates the TBProMenu to show the signed-in state
 *   -> any other context (e.g. popup) watching storage.onChanged for
 *      STORAGE_KEY_AUTH observes the same value, proving the shared-storage
 *      sync primitive this harness models actually propagates correctly.
 */
import { OIDC_USER, STORAGE_KEY_AUTH } from '@send-frontend/lib/const';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('Happy path: clean login sync across contexts', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    teardownHost();
  });

  it('a single OIDC_USER message stores auth, updates the menu, and is visible to a second context via storage.onChanged', async () => {
    const bg = stubContext(host);
    await import('../../background');

    // A second, independent context (e.g. the popup) is watching auth
    // state the same way real code does -- via storage.onChanged.
    const popup = host.createContext('popup');
    const onAuthChanged = vi.fn();
    popup.browser.storage.onChanged.addListener((changes: any) => {
      if (changes[STORAGE_KEY_AUTH]) onAuthChanged(changes[STORAGE_KEY_AUTH]);
    });

    const user = {
      profile: { preferred_username: 'user@example.com' },
      refresh_token: 'fresh-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    await bg.deliverMessage({ type: OIDC_USER, user, email: 'user@example.com' });

    // Background persisted the full user object under STORAGE_KEY_AUTH.
    const stored = await bg.browser.storage.local.get(STORAGE_KEY_AUTH);
    expect(stored[STORAGE_KEY_AUTH]).toEqual(user);

    // The menu was updated to reflect the signed-in state.
    expect(bg.browser.TBProMenu.update).toHaveBeenCalledWith(
      'root',
      expect.objectContaining({ secondaryTitle: 'user@example.com' })
    );
    expect(bg.browser.TBProMenu.create).toHaveBeenCalledWith(
      'logout',
      expect.anything()
    );

    // The independent popup context saw the SAME auth value propagate
    // through the shared storage.onChanged event -- this is the real
    // cross-context sync primitive this add-on relies on in production.
    expect(onAuthChanged).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: user })
    );
  });
});
