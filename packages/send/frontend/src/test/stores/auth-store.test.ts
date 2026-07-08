import { useAuthStore } from '@send-frontend/stores/auth-store';
import { UserManager } from 'oidc-client-ts';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Force the config store's `isThunderbirdHost` (derived from the user agent) on
 * or off. Must be called BEFORE useAuthStore(), because the auth store reads the
 * value once at setup time.
 */
function setThunderbirdHost(isThunderbird: boolean) {
  Object.defineProperty(navigator, 'userAgent', {
    value: isThunderbird
      ? 'Mozilla/5.0 Thunderbird/128.0'
      : 'Mozilla/5.0 Firefox/128.0',
    configurable: true,
  });
}

describe('auth-store token refresh', () => {
  let signinSilent: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    signinSilent = vi.spyOn(UserManager.prototype, 'signinSilent');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dedupes concurrent refreshes into a single signinSilent call', async () => {
    setThunderbirdHost(false);
    // Resolve only after both callers have started, so both observe the same
    // in-flight promise.
    let resolveSignin: (value: unknown) => void;
    signinSilent.mockReturnValue(
      new Promise((resolve) => {
        resolveSignin = resolve;
      }) as never
    );

    const auth = useAuthStore();
    const first = auth.refreshToken();
    const second = auth.refreshToken();

    resolveSignin!({ access_token: 'fresh-token', expired: false });
    const [a, b] = await Promise.all([first, second]);

    expect(signinSilent).toHaveBeenCalledTimes(1);
    expect(a).toBe('fresh-token');
    expect(b).toBe('fresh-token');
  });

  it('runs a fresh signinSilent again after the in-flight one settles', async () => {
    setThunderbirdHost(false);
    signinSilent.mockResolvedValue({
      access_token: 'token-1',
      expired: false,
    } as never);

    const auth = useAuthStore();
    await auth.refreshToken();
    await auth.refreshToken();

    expect(signinSilent).toHaveBeenCalledTimes(2);
  });

  it('signs out and notifies the add-on on a genuine invalid_grant failure', async () => {
    setThunderbirdHost(true);
    const postMessage = vi
      .spyOn(window, 'postMessage')
      .mockImplementation(() => {});
    signinSilent.mockRejectedValue({ error: 'invalid_grant' } as never);

    const auth = useAuthStore();
    auth.isLoggedIn = true;

    const token = await auth.refreshToken();

    expect(token).toBeNull();
    expect(auth.isLoggedIn).toBe(false);
    expect(auth.currentUser).toBeNull();
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'SIGN_OUT' },
      window.location.origin
    );
  });

  it('preserves the session and does not notify on a transient failure', async () => {
    setThunderbirdHost(true);
    const postMessage = vi
      .spyOn(window, 'postMessage')
      .mockImplementation(() => {});
    signinSilent.mockRejectedValue(new Error('network down') as never);

    const auth = useAuthStore();
    auth.isLoggedIn = true;

    const token = await auth.refreshToken();

    expect(token).toBeNull();
    // A network blip must not log the user out.
    expect(auth.isLoggedIn).toBe(true);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('does not post SIGN_OUT when not running inside Thunderbird', async () => {
    setThunderbirdHost(false);
    const postMessage = vi
      .spyOn(window, 'postMessage')
      .mockImplementation(() => {});
    signinSilent.mockRejectedValue({ error: 'invalid_grant' } as never);

    const auth = useAuthStore();
    auth.isLoggedIn = true;

    await auth.refreshToken();

    expect(auth.isLoggedIn).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });
});

describe('auth-store forced logout (#960)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears session, dispatches tbpro:force-logout, and can run again (guard resets)', async () => {
    setThunderbirdHost(false);
    const removeUser = vi
      .spyOn(UserManager.prototype, 'removeUser')
      .mockResolvedValue(undefined as never);
    const dispatch = vi.spyOn(window, 'dispatchEvent');

    const auth = useAuthStore();
    auth.isLoggedIn = true;

    await auth.handleForcedLogout();
    await auth.handleForcedLogout();

    // Guard resets in `finally`, so a second forced logout still runs — it is
    // not a permanent no-op.
    expect(removeUser).toHaveBeenCalledTimes(2);
    expect(auth.isLoggedIn).toBe(false);
    const forceLogoutEvents = dispatch.mock.calls.filter(
      ([e]) => (e as Event).type === 'tbpro:force-logout'
    );
    expect(forceLogoutEvents).toHaveLength(2);
  });
});
