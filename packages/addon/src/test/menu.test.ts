import { BASE_URL } from '@send-frontend/apps/common/constants';
import { STORAGE_KEY_AUTH } from '@send-frontend/lib/const';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getLoginState, menuLogout } from '../menu';

/**
 * Regression guard: getLoginState() is a read-only probe (called by the Send
 * route guard via GET_LOGIN_STATE and by a 60s timer). It must never close tabs
 * or wipe storage as a side effect. In particular, an *expired access token*
 * (short-lived `expires_at`) is NOT logged out — the web app refreshes it
 * silently with the refresh_token — so it must keep returning isLoggedIn: true
 * and leave open send.tb.pro tabs alone. Previously the expiry branch called
 * closeAllAddOnTabs(), which closed the Send dashboard tab opened from the
 * accounts dashboard.
 */

const USERNAME = 'user@example.com';

function setupBrowserMock(
  authValue: unknown,
  tabs: Array<{ id?: number; url?: string }> = []
) {
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: vi
          .fn()
          .mockResolvedValue(
            authValue === undefined ? {} : { [STORAGE_KEY_AUTH]: authValue }
          ),
        remove: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
      },
    },
    tabs: {
      query: vi.fn().mockResolvedValue(tabs),
      remove: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
    windows: {
      getAll: vi.fn().mockResolvedValue([]),
    },
    TBProMenu: {
      update: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    i18n: { getMessage: vi.fn((key: string) => key) },
  });
}

// `expires_at` is a Unix timestamp in seconds (OIDC access-token expiry).
const PAST = Math.floor(Date.now() / 1000) - 3600;
const FUTURE = Math.floor(Date.now() / 1000) + 3600;

const authWith = (overrides: Record<string, unknown> = {}) => ({
  refresh_token: 'refresh-abc',
  expires_at: FUTURE,
  profile: { preferred_username: USERNAME },
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getLoginState', () => {
  it('reports logged out and closes no tabs when no auth is stored', async () => {
    setupBrowserMock(undefined);

    const state = await getLoginState();

    expect(state).toEqual({ isLoggedIn: false, username: null });
    expect(browser.tabs.remove).not.toHaveBeenCalled();
  });

  it('stays logged in WITHOUT closing tabs when the access token has expired', async () => {
    setupBrowserMock(authWith({ expires_at: PAST }));

    const state = await getLoginState();

    expect(state).toEqual({ isLoggedIn: true, username: USERNAME });
    // The core regression: an expired access token must not tear down Send tabs.
    expect(browser.tabs.remove).not.toHaveBeenCalled();
    expect(browser.storage.local.remove).not.toHaveBeenCalled();
  });

  it('reports logged in for a stored session with a valid token', async () => {
    setupBrowserMock(authWith());

    const state = await getLoginState();

    expect(state).toEqual({ isLoggedIn: true, username: USERNAME });
    expect(browser.tabs.remove).not.toHaveBeenCalled();
  });

  it('falls back to the profile email when preferred_username is absent', async () => {
    setupBrowserMock(
      authWith({ profile: { email: USERNAME }, expires_at: PAST })
    );

    const state = await getLoginState();

    expect(state).toEqual({ isLoggedIn: true, username: USERNAME });
  });

  it('reports logged out when the stored session has no refresh_token', async () => {
    setupBrowserMock(authWith({ refresh_token: undefined }));

    const state = await getLoginState();

    expect(state).toEqual({ isLoggedIn: false, username: null });
    expect(browser.tabs.remove).not.toHaveBeenCalled();
  });
});

/**
 * menuLogout() is the genuine-logout chokepoint (menu Logout click + SIGN_OUT
 * message). Unlike getLoginState(), it MAY have destructive side effects: it
 * closes stale Send tabs left on the now-ended session. It must only close tabs
 * pointing at the Send web app (BASE_URL) and must still open the /logout page.
 */
describe('menuLogout', () => {
  it('closes only Send tabs and leaves unrelated tabs alone', async () => {
    setupBrowserMock(undefined, [
      { id: 1, url: `${BASE_URL}/send/profile` },
      { id: 2, url: `${BASE_URL}/logout` },
      { id: 3, url: 'https://accounts.tb.pro/dashboard' },
      { id: 4, url: 'https://example.com/' },
      { id: 5, url: undefined },
    ]);

    await menuLogout();

    expect(browser.tabs.remove).toHaveBeenCalledWith(1);
    expect(browser.tabs.remove).toHaveBeenCalledWith(2);
    expect(browser.tabs.remove).not.toHaveBeenCalledWith(3);
    expect(browser.tabs.remove).not.toHaveBeenCalledWith(4);
    expect(browser.tabs.remove).toHaveBeenCalledTimes(2);
  });

  it('opens the logout page and clears storage after closing tabs', async () => {
    setupBrowserMock(undefined, [{ id: 1, url: `${BASE_URL}/send` }]);

    await menuLogout();

    expect(browser.storage.local.clear).toHaveBeenCalled();
    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: `${BASE_URL}/logout`,
    });

    // Order is load-bearing: the freshly opened /logout tab also matches
    // startsWith(BASE_URL), so tabs must be closed BEFORE it is created or it
    // would be swept up and logout would break.
    const removeOrder = (browser.tabs.remove as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const createOrder = (browser.tabs.create as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(removeOrder).toBeLessThan(createOrder);
  });

  it('keeps closing tabs and opens logout even if one removal fails', async () => {
    setupBrowserMock(undefined, [
      { id: 1, url: `${BASE_URL}/a` },
      { id: 2, url: `${BASE_URL}/b` },
    ]);
    (browser.tabs.remove as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('cannot remove')
    );

    await menuLogout();

    expect(browser.tabs.remove).toHaveBeenCalledTimes(2);
    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: `${BASE_URL}/logout`,
    });
  });
});
