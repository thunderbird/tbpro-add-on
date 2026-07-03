import { STORAGE_KEY_AUTH } from '@send-frontend/lib/const';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getLoginState } from '../menu';

/**
 * Regression guard: getLoginState() is a read-only probe (called by the Send
 * route guard via GET_LOGIN_STATE and by a 60s timer). It must never close tabs
 * or wipe storage as a side effect. In particular, an *expired access token*
 * (short-lived `expires_at`) is NOT logged out — the web app refreshes it
 * silently with the refresh_token — so it must keep returning isLoggedIn: true
 * and leave open send.tb.pro tabs alone. Previously the expiry branch called
 * closeAllTbProTabs(), which closed the Send dashboard tab opened from the
 * accounts dashboard.
 */

const USERNAME = 'user@example.com';

function setupBrowserMock(authValue: unknown) {
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue(
          authValue === undefined ? {} : { [STORAGE_KEY_AUTH]: authValue }
        ),
        remove: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
      },
    },
    tabs: {
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
