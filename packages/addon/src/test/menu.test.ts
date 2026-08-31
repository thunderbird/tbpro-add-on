import { BASE_URL } from '@send-frontend/apps/common/constants';
import { STORAGE_KEY_AUTH } from '@send-frontend/lib/const';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Safe to import statically: MENU_ACTIONS is frozen string constants, so it
// carries none of the module state that loadMenu() exists to reset.
import { MENU_ACTIONS } from '../menu';

/**
 * menu.ts remembers which user the app menu is currently rendered for, so each
 * test needs a module with that state freshly zeroed rather than whatever the
 * previous test left behind.
 */
async function loadMenu() {
  vi.resetModules();
  return import('../menu');
}

const mockOf = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/**
 * Holds the menu's first update() call open, so a test can land a second caller
 * squarely in the middle of a rebuild.
 */
function holdFirstMenuUpdate() {
  let release: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  mockOf(browser.TBProMenu.update).mockImplementationOnce(() => held);
  return () => release();
}

// Array.prototype.at is outside this package's TS lib target, hence the indexing.
const lastCallProps = (fn: unknown) => {
  const { calls } = mockOf(fn).mock;
  return calls[calls.length - 1]?.[1];
};

const lastCallOrder = (fn: unknown) => {
  const { invocationCallOrder } = mockOf(fn).mock;
  return invocationCallOrder[invocationCallOrder.length - 1];
};

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

    const { getLoginState } = await loadMenu();

    const state = await getLoginState();

    expect(state).toEqual({ isLoggedIn: false, username: null });
    expect(browser.tabs.remove).not.toHaveBeenCalled();
  });

  it('stays logged in WITHOUT closing tabs when the access token has expired', async () => {
    setupBrowserMock(authWith({ expires_at: PAST }));

    const { getLoginState } = await loadMenu();

    const state = await getLoginState();

    expect(state).toEqual({ isLoggedIn: true, username: USERNAME });
    // The core regression: an expired access token must not tear down Send tabs.
    expect(browser.tabs.remove).not.toHaveBeenCalled();
    expect(browser.storage.local.remove).not.toHaveBeenCalled();
  });

  it('reports logged in for a stored session with a valid token', async () => {
    setupBrowserMock(authWith());

    const { getLoginState } = await loadMenu();

    const state = await getLoginState();

    expect(state).toEqual({ isLoggedIn: true, username: USERNAME });
    expect(browser.tabs.remove).not.toHaveBeenCalled();
  });

  it('falls back to the profile email when preferred_username is absent', async () => {
    setupBrowserMock(
      authWith({ profile: { email: USERNAME }, expires_at: PAST })
    );

    const { getLoginState } = await loadMenu();

    const state = await getLoginState();

    expect(state).toEqual({ isLoggedIn: true, username: USERNAME });
  });

  it('reports logged out when the stored session has no refresh_token', async () => {
    setupBrowserMock(authWith({ refresh_token: undefined }));

    const { getLoginState } = await loadMenu();

    const state = await getLoginState();

    expect(state).toEqual({ isLoggedIn: false, username: null });
    expect(browser.tabs.remove).not.toHaveBeenCalled();
  });
});

/**
 * Regression guard for Bug 2064203 comment 4 / Bug 2067502. When Thunderbird's
 * QuotaManager fails, every browser.storage.local call rejects. The probe used
 * to swallow that and answer "signed out", which is a different statement than
 * "I could not tell" — and callers acted on it, unregistering the Send cloud
 * file provider for people who were still signed in.
 */
describe('getLoginState when storage is unavailable', () => {
  const storageError = () => new Error('An unexpected error occurred');

  /** Drives the retry backoff without spending real time on it. */
  async function settle<T>(pending: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(5000);
    return pending;
  }

  function setupFailingStorage(get: unknown) {
    setupBrowserMock(undefined);
    (browser.storage.local as { get: unknown }).get = get;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports storageUnavailable instead of a bare signed-out state', async () => {
    setupFailingStorage(vi.fn().mockRejectedValue(storageError()));

    const { getLoginState } = await loadMenu();

    const state = await settle(getLoginState());

    expect(state).toEqual({
      isLoggedIn: false,
      username: null,
      storageUnavailable: true,
    });
  });

  it('retries a failing read before giving up', async () => {
    const get = vi.fn().mockRejectedValue(storageError());
    setupFailingStorage(get);

    const { getLoginState } = await loadMenu();

    await settle(getLoginState());

    expect(get.mock.calls.length).toBeGreaterThan(1);
  });

  it('recovers the session when a retry succeeds', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(storageError())
      .mockResolvedValue({ [STORAGE_KEY_AUTH]: authWith() });
    setupFailingStorage(get);

    const { getLoginState } = await loadMenu();

    const state = await settle(getLoginState());

    expect(state).toEqual({ isLoggedIn: true, username: USERNAME });
  });

  it('logs the storage error once per failure streak, not once per probe', async () => {
    setupFailingStorage(vi.fn().mockRejectedValue(storageError()));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { getLoginState } = await loadMenu();

    await settle(getLoginState());
    const afterFirstProbe = consoleError.mock.calls.length;
    await settle(getLoginState());
    await settle(getLoginState());

    expect(consoleError.mock.calls.length).toBe(afterFirstProbe);
  });

  it('logs again once storage has recovered and failed anew', async () => {
    const get = vi.fn().mockRejectedValue(storageError());
    setupFailingStorage(get);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { getLoginState } = await loadMenu();

    await settle(getLoginState());
    const afterFirstStreak = consoleError.mock.calls.length;

    get.mockResolvedValueOnce({});
    await settle(getLoginState());

    get.mockRejectedValue(storageError());
    await settle(getLoginState());

    expect(consoleError.mock.calls.length).toBeGreaterThan(afterFirstStreak);
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

    const { menuLogout } = await loadMenu();

    await menuLogout();

    expect(browser.tabs.remove).toHaveBeenCalledWith(1);
    expect(browser.tabs.remove).toHaveBeenCalledWith(2);
    expect(browser.tabs.remove).not.toHaveBeenCalledWith(3);
    expect(browser.tabs.remove).not.toHaveBeenCalledWith(4);
    expect(browser.tabs.remove).toHaveBeenCalledTimes(2);
  });

  it('opens the logout page and clears storage after closing tabs', async () => {
    setupBrowserMock(undefined, [{ id: 1, url: `${BASE_URL}/send` }]);

    const { menuLogout } = await loadMenu();

    await menuLogout();

    // menuLogout() fully wipes the add-on's storage via a blanket
    // storage.local.clear() -- a genuine logout returns the add-on to a clean,
    // logged-out state. storage.local is per-extension isolated, so this only
    // touches TB-Send's own data (see #1054 / A5).
    expect(browser.storage.local.clear).toHaveBeenCalledTimes(1);
    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: `${BASE_URL}/logout`,
    });

    // Order is load-bearing: the freshly opened /logout tab also matches
    // startsWith(BASE_URL), so tabs must be closed BEFORE it is created or it
    // would be swept up and logout would break.
    const removeOrder = mockOf(browser.tabs.remove).mock.invocationCallOrder[0];
    const createOrder = mockOf(browser.tabs.create).mock.invocationCallOrder[0];
    expect(removeOrder).toBeLessThan(createOrder);
  });

  it('keeps closing tabs and opens logout even if one removal fails', async () => {
    setupBrowserMock(undefined, [
      { id: 1, url: `${BASE_URL}/a` },
      { id: 2, url: `${BASE_URL}/b` },
    ]);
    mockOf(browser.tabs.remove).mockRejectedValueOnce(
      new Error('cannot remove')
    );

    const { menuLogout } = await loadMenu();

    await menuLogout();

    expect(browser.tabs.remove).toHaveBeenCalledTimes(2);
    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: `${BASE_URL}/logout`,
    });
  });
});

/**
 * Regression guard for #1120. getLoginState() runs every 60 seconds and on every
 * Send route change, and it asks menuLoggedIn() to keep the app menu in step.
 * TBProMenu.create() rejects an id that already exists, so rebuilding the
 * submenu on every one of those calls threw "Menu item manageDashboard already
 * exists" once a minute -- and the old code caught that alongside a genuine
 * storage failure, so a signed-in user was reported as signed out.
 */
const SIGNED_IN_MENU_ITEMS = 4;

const createsFor = (action: string) =>
  mockOf(browser.TBProMenu.create).mock.calls.filter(([id]) => id === action)
    .length;

describe('menu upkeep during repeated login checks', () => {
  it('builds the signed-in submenu once, not on every check', async () => {
    setupBrowserMock(authWith());
    const { getLoginState } = await loadMenu();

    await getLoginState();
    expect(browser.TBProMenu.create).toHaveBeenCalledTimes(
      SIGNED_IN_MENU_ITEMS
    );

    // Three more probes, standing in for the next three minutes of the timer.
    for (let i = 0; i < 3; i++) {
      const state = await getLoginState();
      expect(state).toEqual({ isLoggedIn: true, username: USERNAME });
    }

    // Nothing was re-added, so there is nothing to collide with and nothing to log.
    expect(browser.TBProMenu.create).toHaveBeenCalledTimes(
      SIGNED_IN_MENU_ITEMS
    );
  });

  it('builds the submenu once when two login checks overlap', async () => {
    setupBrowserMock(authWith());
    const { getLoginState } = await loadMenu();

    // init() fires a login check without waiting for it while background's
    // main() awaits its own, so the very first two checks genuinely overlap.
    const states = await Promise.all([getLoginState(), getLoginState()]);

    expect(states).toEqual([
      { isLoggedIn: true, username: USERNAME },
      { isLoggedIn: true, username: USERNAME },
    ]);
    expect(browser.TBProMenu.create).toHaveBeenCalledTimes(
      SIGNED_IN_MENU_ITEMS
    );
  });

  it('empties the submenu before adding the signed-in items', async () => {
    setupBrowserMock(authWith());
    const { getLoginState } = await loadMenu();

    await getLoginState();

    // Order is load-bearing: clearing after the items were added would wipe them.
    expect(browser.TBProMenu.clear).toHaveBeenCalledWith(MENU_ACTIONS.ROOT);
    expect(
      mockOf(browser.TBProMenu.clear).mock.invocationCallOrder[0]
    ).toBeLessThan(
      mockOf(browser.TBProMenu.create).mock.invocationCallOrder[0]
    );
  });

  it('reports the session as live even when the menu cannot be updated', async () => {
    setupBrowserMock(authWith());
    const { getLoginState } = await loadMenu();
    mockOf(browser.TBProMenu.create).mockRejectedValueOnce(
      new Error('Menu item manageDashboard already exists')
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const state = await getLoginState();

    // The stored session is untouched by a menu problem, so the Send route guard
    // must not be told the user is signed out.
    expect(state).toEqual({ isLoggedIn: true, username: USERNAME });
  });

  it('retries the submenu on the next check after a partial failure', async () => {
    setupBrowserMock(authWith());
    const { getLoginState } = await loadMenu();
    mockOf(browser.TBProMenu.create).mockRejectedValueOnce(
      new Error('menu is having a bad day')
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await getLoginState();
    expect(createsFor(MENU_ACTIONS.MANAGE_DASHBOARD)).toBe(1);

    await getLoginState();

    // A half-built menu is not treated as done, so the next check finishes it.
    expect(createsFor(MENU_ACTIONS.MANAGE_DASHBOARD)).toBe(2);
    expect(browser.TBProMenu.create).toHaveBeenCalledWith(
      MENU_ACTIONS.LOGOUT,
      expect.anything()
    );
  });

  it('rebuilds the submenu when a user signs in again after signing out', async () => {
    setupBrowserMock(authWith());
    const { getLoginState, menuLogout } = await loadMenu();

    await getLoginState();
    await menuLogout();
    mockOf(browser.TBProMenu.create).mockClear();

    await getLoginState();

    // Signing out empties the submenu, so the next sign-in has to put it back.
    expect(browser.TBProMenu.create).toHaveBeenCalledTimes(
      SIGNED_IN_MENU_ITEMS
    );
  });
});

/**
 * Sign-in and sign-out reach the menu from several directions at once -- the 60s
 * timer, the Send route guard, background's sign-in message handlers, and the
 * Logout menu item -- so they can interleave. Whatever order they arrive in, the
 * menu and the "who is this rendered for?" bookkeeping have to agree afterwards,
 * because a mismatch is not self-correcting: getLoginState() stops touching the
 * menu once it believes the user is signed out.
 */
describe('overlapping sign-in and sign-out', () => {
  it('ends up signed out when a sign-out lands mid-rebuild', async () => {
    setupBrowserMock(authWith());
    const { menuLoggedIn, menuLogout } = await loadMenu();
    const release = holdFirstMenuUpdate();

    const signIn = menuLoggedIn({ username: USERNAME });
    const signOut = menuLogout();
    release();
    await Promise.all([signIn, signOut]);

    // The sign-out came last, so the menu must be left showing the sign-in
    // prompt -- not that prompt sitting above a populated signed-in submenu.
    expect(lastCallProps(browser.TBProMenu.update)).toMatchObject({
      secondaryTitle: 'thunderbirdPro',
    });
    expect(lastCallOrder(browser.TBProMenu.clear)).toBeGreaterThan(
      lastCallOrder(browser.TBProMenu.create)
    );
  });

  it('still rebuilds when the same user signs back in after that', async () => {
    setupBrowserMock(authWith());
    const { menuLoggedIn, menuLogout } = await loadMenu();
    const release = holdFirstMenuUpdate();

    const signIn = menuLoggedIn({ username: USERNAME });
    const signOut = menuLogout();
    release();
    await Promise.all([signIn, signOut]);
    mockOf(browser.TBProMenu.create).mockClear();

    await menuLoggedIn({ username: USERNAME });

    // The interleaved sign-out must not leave the menu convinced it is already
    // rendered for this user; that would strand it in the signed-out state until
    // Thunderbird restarted.
    expect(browser.TBProMenu.create).toHaveBeenCalledTimes(
      SIGNED_IN_MENU_ITEMS
    );
  });

  it('shows the second account when two different sign-ins overlap', async () => {
    setupBrowserMock(authWith());
    const { menuLoggedIn } = await loadMenu();
    const release = holdFirstMenuUpdate();

    const alice = menuLoggedIn({ username: 'alice@example.com' });
    const bob = menuLoggedIn({ username: 'bob@example.com' });
    release();
    await Promise.all([alice, bob]);

    // Bob's caller must not piggyback on Alice's rebuild and report success
    // while the menu still shows Alice.
    expect(lastCallProps(browser.TBProMenu.update)).toMatchObject({
      secondaryTitle: 'bob@example.com',
    });
    expect(browser.TBProMenu.create).toHaveBeenCalledTimes(
      SIGNED_IN_MENU_ITEMS * 2
    );
  });
});
