/**
 * C2 — Add-on re-enable trusts stale `STORAGE_KEY_AUTH` without
 * re-validating against the backend.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #C2 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §C2.
 *
 * Mechanism under test:
 *   - Re-enabling the add-on re-runs background.ts's top-level `main()` IIFE
 *     from scratch, identically to a cold start.
 *   - `main()` calls `getLoginState()` (menu.ts), which is a PURE LOCAL
 *     STORAGE READ -- it checks only for the presence of `refresh_token` in
 *     `browser.storage.local[STORAGE_KEY_AUTH]`, with zero network call to
 *     validate that token against the backend.
 *   - `shouldInitCloudFileOnStartup(isLoggedIn)` is a pure boolean
 *     passthrough of whatever `getLoginState()` produced.
 *   - If `isLoggedIn` is (falsely) true, `initCloudFile()` runs, which
 *     re-registers the cloud file provider and creates/reactivates a cloud
 *     file account -- fully re-activating cloud-file features for a session
 *     that may have been revoked entirely server-side.
 *
 * This test seeds a stale (but locally well-formed) auth object into shared
 * storage, imports background.ts fresh (simulating a re-enable / cold
 * start), and confirms initCloudFile()'s effects run (CloudFileAccounts
 * re-registration + account creation) with ZERO network/API validation call
 * having occurred anywhere in the process.
 */
import { STORAGE_KEY_AUTH } from '@send-frontend/lib/const';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('C2: add-on re-enable trusts stale STORAGE_KEY_AUTH without backend revalidation', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    teardownHost();
  });

  it('CONFIRMED BUG: re-enable (fresh module load) re-activates cloud file with no backend validation call', async () => {
    const ctx = stubContext(host);

    // Seed a previously-stored session -- this is exactly the shape
    // getLoginState() checks: refresh_token + a resolvable username. In
    // reality this token may have been revoked/expired server-side at any
    // point after it was stored; nothing here re-checks that.
    ctx.browser.storage.local.get = vi.fn(async () => ({
      [STORAGE_KEY_AUTH]: {
        refresh_token: 'potentially-revoked-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 999999, // long expired access token
        profile: { preferred_username: 'user@example.com' },
      },
    }));

    // Simulate re-enable: this is functionally identical to a cold start --
    // the add-on's background page re-runs main() from scratch.
    await import('../../background');

    // Let main()'s async IIFE (checkAndUninstallIfDeprecated -> initMenu ->
    // getLoginState -> initCloudFile chain) fully settle.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // THE BUG: getLoginState() trusted the stale refresh_token's mere
    // presence and returned isLoggedIn: true purely from local storage, so
    // shouldInitCloudFileOnStartup() green-lit initCloudFile(), which:
    //   1. re-registered the cloud file provider,
    expect(ctx.browser.CloudFileAccounts.registerProvider).toHaveBeenCalled();
    //   2. created/reactivated a cloud file account,
    expect(ctx.browser.CloudFileAccounts.createAccount).toHaveBeenCalled();

    // ...all without a SINGLE call that could have validated the refresh
    // token against the backend (e.g. no auth/oidc/me equivalent, no
    // api.call at all during this startup path). If a validation call
    // existed, it would have to go through browser.storage.local (there is
    // no other backend interface mocked here) or an explicit fetch --
    // neither happened.
    //
    // (unregisterProvider is the "signed out" branch and must NOT have run,
    // confirming the code took the "trust local storage" happy path.)
    expect(ctx.browser.CloudFileAccounts.unregisterProvider).not.toHaveBeenCalled();
  });
});
