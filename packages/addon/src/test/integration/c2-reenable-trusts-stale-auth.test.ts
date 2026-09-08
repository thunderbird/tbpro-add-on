/**
 * C2 — Add-on re-enable no longer blindly trusts stale `STORAGE_KEY_AUTH`
 * (fixed: #1030).
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #C2 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §C2.
 *
 * Mechanism under test:
 *   - Re-enabling the add-on re-runs background.ts's top-level `main()` IIFE
 *     from scratch, identically to a cold start.
 *   - `main()` still calls `getLoginState()` (menu.ts), which stays a PURE
 *     LOCAL STORAGE READ (the 60s timer and the route guard depend on it
 *     being cheap), so `initCloudFile()` still runs first on the locally
 *     stored state.
 *   - THE FIX: after the watchers are up, `main()` fires a non-blocking
 *     `validateStoredSessionOnStartup()`, which GETs
 *     `{sendServerUrl}/api/auth/oidc/me` with the stored access token (the
 *     same check the web app's auth-store `checkAuthStatus()` performs).
 *   - On a definitive auth rejection (401/403/404 — a revoked/invalid
 *     session) of a token that is NOT merely expired, the silent
 *     forced-logout cleanup runs: STORAGE_KEY_AUTH is removed, the menu
 *     flips to signed-out, and the cloud file provider that startup had
 *     just re-activated is unregistered. No tabs are opened.
 *   - On a 200 (still-valid session) — or any transient/network error
 *     (fail-open) — nothing is torn down and the user stays signed in.
 *   - If the stored access token is ALREADY EXPIRED, the check is skipped
 *     entirely: a merely-expired token is not proof of revocation (the web
 *     app refreshes it on next use), so we must not sign out a valid idle
 *     user at startup.
 */
import { STORAGE_KEY_AUTH } from '@send-frontend/lib/const';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

// A stored session whose access token is still WITHIN its lifetime. Only a
// backend rejection of a non-expired token proves the session was revoked, so
// this is the shape that must trigger the forced-logout path.
const STALE_AUTH = {
  access_token: 'potentially-revoked-access-token',
  refresh_token: 'potentially-revoked-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600, // access token still valid
  profile: { preferred_username: 'user@example.com' },
};

// Same session but with an already-expired access token: a merely-expired
// token is refreshable and must NOT be treated as revoked.
const EXPIRED_AUTH = {
  ...STALE_AUTH,
  expires_at: Math.floor(Date.now() / 1000) - 999999,
};

/** Seeds a previously-stored session — exactly the shape getLoginState()
 * checks (refresh_token + resolvable username). */
function seedStaleAuth(
  ctx: ReturnType<typeof stubContext>,
  auth: typeof STALE_AUTH = STALE_AUTH
) {
  ctx.browser.storage.local.get = vi.fn(async () => ({
    [STORAGE_KEY_AUTH]: auth,
  }));
}

/** Stubs global fetch so the startup /api/auth/oidc/me validation call
 * resolves with the given HTTP status. Returns the mock for assertions. */
function stubValidationFetch(status: number) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(status === 200 ? { user: {} } : {}),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('C2 (fixed, #1030): add-on re-enable revalidates stored STORAGE_KEY_AUTH against the backend', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    teardownHost();
  });

  it('re-enable validates the stored session with the backend and, on 401 (revoked), silently tears it down', async () => {
    const ctx = stubContext(host);
    seedStaleAuth(ctx);
    const fetchMock = stubValidationFetch(401);

    // Simulate re-enable: this is functionally identical to a cold start —
    // the add-on's background page re-runs main() from scratch.
    await import('../../background');

    // Startup still proceeds optimistically on the local state first
    // (getLoginState() stays a cheap local read by design), so the cloud
    // file provider is re-activated...
    await vi.waitFor(() =>
      expect(ctx.browser.CloudFileAccounts.registerProvider).toHaveBeenCalled()
    );

    // ...but THE FIX then validates the stored access token against the
    // backend, exactly like auth-store's checkAuthStatus():
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/auth\/oidc\/me$/),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${STALE_AUTH.access_token}`,
          }),
        })
      )
    );

    // The 401 is a definitive "session revoked", so the silent forced-logout
    // cleanup runs: the stale stored session is cleared...
    await vi.waitFor(() =>
      expect(ctx.browser.storage.local.remove).toHaveBeenCalledWith(
        STORAGE_KEY_AUTH
      )
    );
    // ...and the provider that startup had just re-activated is torn back
    // down (unregisterProvider is otherwise only the signed-out startup
    // branch, which did NOT run here).
    await vi.waitFor(() =>
      expect(
        ctx.browser.CloudFileAccounts.unregisterProvider
      ).toHaveBeenCalled()
    );
    // Silent means silent: no /logout tab (menuLogout() would open one).
    expect(ctx.browser.tabs.create).not.toHaveBeenCalled();
  });

  it('re-enable with a still-valid session (200 from /oidc/me) keeps the user signed in and cloud file active', async () => {
    const ctx = stubContext(host);
    seedStaleAuth(ctx);
    const fetchMock = stubValidationFetch(200);

    await import('../../background');

    await vi.waitFor(() =>
      expect(ctx.browser.CloudFileAccounts.registerProvider).toHaveBeenCalled()
    );
    expect(ctx.browser.CloudFileAccounts.createAccount).toHaveBeenCalled();

    // The validation call still happens...
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/auth\/oidc\/me$/),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${STALE_AUTH.access_token}`,
          }),
        })
      )
    );

    // ...but a 200 means the session is genuinely alive: NO forced logout.
    // Give the (async, fire-and-forget) validation a beat to have run.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ctx.browser.storage.local.remove).not.toHaveBeenCalledWith(
      STORAGE_KEY_AUTH
    );
    expect(
      ctx.browser.CloudFileAccounts.unregisterProvider
    ).not.toHaveBeenCalled();
  });

  it('re-enable with an already-expired access token SKIPS validation (a refreshable token is not proof of revocation)', async () => {
    const ctx = stubContext(host);
    seedStaleAuth(ctx, EXPIRED_AUTH);
    const fetchMock = stubValidationFetch(401);

    await import('../../background');

    // Startup still activates cloud file on the local state.
    await vi.waitFor(() =>
      expect(ctx.browser.CloudFileAccounts.registerProvider).toHaveBeenCalled()
    );

    // The expired token is not sent for validation at all — the web app's
    // refresh path owns that case, so a 401 here would be a false positive.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    // And the idle-but-valid user is NOT torn down.
    expect(ctx.browser.storage.local.remove).not.toHaveBeenCalledWith(
      STORAGE_KEY_AUTH
    );
    expect(
      ctx.browser.CloudFileAccounts.unregisterProvider
    ).not.toHaveBeenCalled();
  });
});
