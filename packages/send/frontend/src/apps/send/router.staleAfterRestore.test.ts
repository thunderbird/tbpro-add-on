import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  type NavigationGuardWithThis,
  type Router,
} from 'vue-router';

/**
 * Router-guard coverage for the cross-client passphrase-reset lockout (trigger
 * path #2): a client that STILL HOLDS stale in-memory keys.
 *
 * The bug: when the passphrase was changed on another client, this client's
 * keychain looks UNLOCKED on entry to the guard (it still has its old keys in
 * memory). So `keychainIsLocked`, captured at the top of `beforeEach`, is false:
 *
 *   - the requiresBackedUpKeys redirect is skipped (not locked yet), and
 *   - validateBackedUpKeys() passes (a backup still exists on the server; it was
 *     just re-wrapped with the new passphrase).
 *
 * The `autoRestoresKeys` step is what actually discovers the mismatch: the
 * restore throws IncorrectPassphraseError and flips `keychain.locked` to true.
 * Because the original redirect check ran BEFORE that, navigation would proceed
 * to a cached `/send/folder/<oldId>`, fail to fetch the subtree, and strand the
 * user on a broken/empty folder view with no recovery.
 *
 * The fix re-checks `keychain.locked` AFTER the restore attempt on
 * requiresBackedUpKeys routes and redirects to /passphrase-changed. These tests
 * transcribe that slice of router.ts's beforeEach and drive a real memory-history
 * router through it (the router module isn't exported as a testable unit).
 */

const META = {
  requiresValidToken: 'requiresValidToken',
  requiresBackedUpKeys: 'requiresBackedUpKeys',
  autoRestoresKeys: 'autoRestoresKeys',
} as const;

type World = {
  // keychain.locked as seen at guard entry (stale client: false).
  keychainLockedOnEntry: boolean;
  // Whether restoreKeysUsingLocalStorage flips keychain.locked to true.
  restoreLocksKeychain: boolean;
  tokenValid: boolean;
  hasBackedUpKeys: boolean;
};

let world: World;
let liveKeychain: { locked: boolean };

const validateToken = vi.fn(async () => world.tokenValid);
const validateBackedUpKeys = vi.fn(async () => world.hasBackedUpKeys);
const restoreKeysUsingLocalStorage = vi.fn(async () => {
  // Mirrors _restoreKeys: an incorrect (stale) passphrase locks the keychain.
  if (world.restoreLocksKeychain) {
    liveKeychain.locked = true;
  }
});

const matchMeta = (to: { meta?: Record<string, unknown> }, key: string) =>
  Boolean(to.meta?.[key]);

/**
 * Faithful transcription of router.ts's beforeEach slice that governs the
 * requiresBackedUpKeys + autoRestoresKeys + post-restore-lock-recheck flow.
 * Order is preserved exactly as in source.
 */
const guard: NavigationGuardWithThis<undefined> = async (to, _from, next) => {
  const keychainIsLocked = liveKeychain.locked; // captured at entry

  const requiresValidToken = matchMeta(to, META.requiresValidToken);
  const requiresBackedUpKeys = matchMeta(to, META.requiresBackedUpKeys);
  const autoRestoresKeys = matchMeta(to, META.autoRestoresKeys);

  if (requiresValidToken) {
    const isTokenValid = await validateToken();
    if (!isTokenValid) return next('/login');
  }

  if (requiresBackedUpKeys) {
    if (keychainIsLocked) {
      return next('/passphrase-changed');
    }
    const backedUp = await validateBackedUpKeys();
    if (!backedUp) {
      return next('/send/profile');
    }
  }

  if (autoRestoresKeys && !keychainIsLocked) {
    try {
      await restoreKeysUsingLocalStorage();
    } catch {
      /* non-locking restore error */
    }
  }

  // The fix: re-check the lock AFTER the restore attempt.
  if (requiresBackedUpKeys && liveKeychain.locked) {
    return next('/passphrase-changed');
  }

  return next();
};

const build = (): Router => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/login', component: { template: '<div/>' } },
      { path: '/passphrase-changed', component: { template: '<div/>' } },
      { path: '/send/profile', component: { template: '<div/>' } },
      {
        // Stands in for the real /send/folder/:id route (router.ts:163-173):
        // requiresValidToken + autoRestoresKeys + requiresBackedUpKeys.
        path: '/send/folder/:id',
        component: { template: '<div/>' },
        meta: {
          [META.requiresValidToken]: true,
          [META.autoRestoresKeys]: true,
          [META.requiresBackedUpKeys]: true,
        },
      },
    ],
  });
  router.beforeEach(guard);
  return router;
};

describe('router guard -> /passphrase-changed after a stale in-memory restore (trigger path #2)', () => {
  beforeEach(() => {
    world = {
      keychainLockedOnEntry: false,
      restoreLocksKeychain: false,
      tokenValid: true,
      hasBackedUpKeys: true,
    };
    liveKeychain = { locked: false };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a stale client (unlocked on entry, restore locks) to /passphrase-changed instead of the cached folder', async () => {
    // Stale client B: still holds old keys, so unlocked on entry; a backup exists
    // on the server; the restore attempt discovers the mismatch and locks.
    liveKeychain.locked = false;
    world.restoreLocksKeychain = true;

    const router = build();
    await router.push('/send/folder/8c70d4bc-cached-old-root');

    // Must land on recovery, NOT the stale folder route.
    expect(restoreKeysUsingLocalStorage).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.path).toBe('/passphrase-changed');
  });

  it('lets a healthy client through to the folder when the restore does NOT lock the keychain', async () => {
    liveKeychain.locked = false;
    world.restoreLocksKeychain = false; // correct keys; restore succeeds

    const router = build();
    await router.push('/send/folder/valid-root');

    expect(router.currentRoute.value.path).toBe('/send/folder/valid-root');
  });

  it('still redirects immediately when the keychain is ALREADY locked on entry (does not need the restore)', async () => {
    liveKeychain.locked = true; // already known-locked

    const router = build();
    await router.push('/send/folder/whatever');

    // The pre-restore check catches it; restore is skipped entirely.
    expect(restoreKeysUsingLocalStorage).not.toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe('/passphrase-changed');
  });
});
