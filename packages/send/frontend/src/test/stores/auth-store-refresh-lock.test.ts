import { useAuthStore } from '@send-frontend/stores/auth-store';
import { UserManager } from 'oidc-client-ts';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cross-context refresh lock tests (#1022).
 *
 * A real cross-context race can't be reproduced in one test process: the
 * background, popup, and web tab each load their own module instance of the
 * auth store, while a single vitest process shares one instance (and thus one
 * `inFlightRefresh`). Instead we simulate the OTHER context through the one
 * thing the contexts genuinely share — `browser.storage.local` — by
 * pre-seeding the lock record (`tbpro-refresh-lock:session`) that the other
 * context would have written, and (for the read-through case) the rotated
 * session it would have persisted under STORAGE_KEY_AUTH. The lock records
 * are seeded with a short expiry so the waiting path terminates
 * deterministically via TTL lapse, without coordinating timers across fake
 * contexts.
 */

const LOCK_KEY = 'tbpro-refresh-lock:session';
const STORAGE_KEY_AUTH = 'STORAGE_KEY_AUTH';

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

/** Minimal in-memory browser.storage.local, shared "across contexts". */
function installMockBrowserStorage() {
  const data = new Map<string, unknown>();
  const local = {
    get: vi.fn(async (key: string) => ({ [key]: data.get(key) })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    }),
    remove: vi.fn(async (key: string) => {
      data.delete(key);
    }),
  };
  (globalThis as Record<string, unknown>).browser = { storage: { local } };
  return data;
}

function rotatedStoredUser() {
  return {
    access_token: 'rotated-token',
    token_type: 'Bearer',
    scope: 'openid profile email offline_access',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    profile: { sub: 'user-1', iss: 'test', aud: 'test', exp: 0, iat: 0 },
  };
}

describe('auth-store cross-context refresh lock (#1022)', () => {
  let signinSilent: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    signinSilent = vi.spyOn(UserManager.prototype, 'signinSilent');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).browser;
    // Clear any session the oidc userManager persisted (storeUser) so tests
    // stay independent. Guarded: happy-dom may not expose both stores.
    globalThis.sessionStorage?.clear?.();
    globalThis.localStorage?.clear?.();
  });

  it('serializes with a peer context: waits instead of firing its own signinSilent and returns the peer-rotated session', async () => {
    setThunderbirdHost(true);
    const storage = installMockBrowserStorage();

    // The "other context" holds the lock and has already persisted the
    // rotated session it obtained. Our context must read that through
    // instead of racing with a second signinSilent().
    storage.set(LOCK_KEY, {
      token: 'peer-context-token',
      expiresAt: Date.now() + 300,
    });
    storage.set(STORAGE_KEY_AUTH, rotatedStoredUser());

    const auth = useAuthStore();
    auth.isLoggedIn = true;

    const token = await auth.refreshToken();

    // The lock serialized us: exactly zero signinSilent calls from THIS
    // context — only the (simulated) peer performed the rotation.
    expect(signinSilent).not.toHaveBeenCalled();
    expect(token).toBe('rotated-token');
    expect(auth.isLoggedIn).toBe(true);
    expect(auth.currentUser?.access_token).toBe('rotated-token');
  });

  it('never signs out on lock loss: no isLoggedIn=false, no SIGN_OUT, even when no fresh session appears', async () => {
    setThunderbirdHost(true);
    const postMessage = vi
      .spyOn(window, 'postMessage')
      .mockImplementation(() => {});
    const storage = installMockBrowserStorage();

    // Peer holds the lock but never persists a session (crashed, or its own
    // refresh failed — in which case IT owns the sign-out, not us).
    storage.set(LOCK_KEY, {
      token: 'peer-context-token',
      expiresAt: Date.now() + 300,
    });

    const auth = useAuthStore();
    auth.isLoggedIn = true;

    const token = await auth.refreshToken();

    expect(token).toBeNull();
    expect(signinSilent).not.toHaveBeenCalled();
    // The core #1022 guarantee: losing the cross-context race must never
    // cause a sign-out.
    expect(auth.isLoggedIn).toBe(true);
    expect(postMessage).not.toHaveBeenCalled();

    // And the failure was not recorded as genuine: a follow-up refresh is
    // allowed to run (lock has lapsed by now) and proceeds normally.
    signinSilent.mockResolvedValue({
      access_token: 'later-token',
      expired: false,
    } as never);
    const retry = await auth.refreshToken();
    expect(retry).toBe('later-token');
    expect(auth.isLoggedIn).toBe(true);
  });

  it('acquires the lock when free, refreshes exactly as before, and releases the lock', async () => {
    setThunderbirdHost(false);
    const storage = installMockBrowserStorage();
    signinSilent.mockResolvedValue({
      access_token: 'fresh-token',
      expired: false,
    } as never);

    const auth = useAuthStore();
    const token = await auth.refreshToken();

    expect(token).toBe('fresh-token');
    expect(signinSilent).toHaveBeenCalledTimes(1);
    // Lock released in finally — nothing left behind to stall the next context.
    expect(storage.get(LOCK_KEY)).toBeUndefined();
  });

  it('releases the lock even when the refresh fails', async () => {
    setThunderbirdHost(false);
    const storage = installMockBrowserStorage();
    signinSilent.mockRejectedValue(new Error('network down') as never);

    const auth = useAuthStore();
    auth.isLoggedIn = true;

    const token = await auth.refreshToken();

    expect(token).toBeNull();
    expect(auth.isLoggedIn).toBe(true); // transient — unchanged behavior
    expect(storage.get(LOCK_KEY)).toBeUndefined();
  });

  it('falls back to a plain refresh when browser.storage.local is unavailable (lone web tab)', async () => {
    setThunderbirdHost(false);
    // No `browser` global at all — nothing to coordinate with, no lock layer.
    expect((globalThis as Record<string, unknown>).browser).toBeUndefined();
    signinSilent.mockResolvedValue({
      access_token: 'web-token',
      expired: false,
    } as never);

    const auth = useAuthStore();
    const token = await auth.refreshToken();

    expect(token).toBe('web-token');
    expect(signinSilent).toHaveBeenCalledTimes(1);
  });
});
