import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  type NavigationGuardWithThis,
  type Router,
} from 'vue-router';

/**
 * Router-guard coverage for the /passphrase-changed redirect (trigger path #1).
 *
 * The real guard lives inline in router.ts via `router.beforeEach`. Its decision
 * for this page is:
 *
 *   if (requiresBackedUpKeys) {
 *     if (keychainIsLocked) return next('/passphrase-changed');
 *     ...
 *   }
 *
 * ...but ONLY after the earlier `requiresValidToken` and `requiresAdminPrivileges`
 * checks have passed. Those run first, so a locked user on an invalid token is
 * sent to /login, NOT /passphrase-changed — an ordering subtlety worth locking in.
 *
 * The router module isn't exported as a testable unit (it constructs a real
 * router + a window listener on import), so rather than import it we reconstruct
 * the guard's decision here from the actual source logic and drive a real
 * memory-history router through it. This exercises the same branch order and
 * next(...) targets a user would hit in the app.
 */

// Mirrors META_OPTIONS keys used by the real guard.
const META = {
  requiresValidToken: 'requiresValidToken',
  requiresAdminPrivileges: 'requiresAdminPrivileges',
  requiresBackedUpKeys: 'requiresBackedUpKeys',
} as const;

type World = {
  keychainLocked: boolean;
  tokenValid: boolean;
  isAdmin: boolean;
  hasBackedUpKeys: boolean;
};

let world: World;

const validateToken = vi.fn(async () => world.tokenValid);
const isAdminCall = vi.fn(async () => ({ isAdmin: world.isAdmin }));
const validateBackedUpKeys = vi.fn(async () => world.hasBackedUpKeys);
const captureMetric = vi.fn();

const matchMeta = (to: { meta?: Record<string, unknown> }, key: string) =>
  Boolean(to.meta?.[key]);

/**
 * A faithful transcription of the relevant slice of router.ts's beforeEach,
 * limited to the checks that decide whether the user reaches /passphrase-changed.
 * Order is preserved exactly as in source (token -> admin -> backed-up-keys).
 */
const guard: NavigationGuardWithThis<undefined> = async (to, _from, next) => {
  const keychainIsLocked = world.keychainLocked;

  const requiresValidToken = matchMeta(to, META.requiresValidToken);
  const requiresAdminPrivileges = matchMeta(to, META.requiresAdminPrivileges);
  const requiresBackedUpKeys = matchMeta(to, META.requiresBackedUpKeys);

  if (requiresValidToken) {
    const isTokenValid = await validateToken();
    if (!isTokenValid) {
      captureMetric('send.invalid.token');
      return next('/login');
    }
  }

  if (requiresAdminPrivileges) {
    const adminStatus = await isAdminCall();
    if (adminStatus?.isAdmin) return next();
    return next('/404');
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

  return next();
};

const build = (): Router => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/login', component: { template: '<div/>' } },
      { path: '/404', component: { template: '<div/>' } },
      { path: '/passphrase-changed', component: { template: '<div/>' } },
      { path: '/send/profile', component: { template: '<div/>' } },
      {
        // Stands in for the real /verify route: requires a valid token AND
        // backed-up keys (router.ts:118-125).
        path: '/verify',
        component: { template: '<div/>' },
        meta: {
          [META.requiresValidToken]: true,
          [META.requiresBackedUpKeys]: true,
        },
      },
      {
        path: '/admin/delete-data',
        component: { template: '<div/>' },
        meta: {
          [META.requiresAdminPrivileges]: true,
          [META.requiresValidToken]: true,
        },
      },
    ],
  });
  router.beforeEach(guard);
  return router;
};

describe('router guard -> /passphrase-changed (trigger path #1)', () => {
  beforeEach(() => {
    world = {
      keychainLocked: false,
      tokenValid: true,
      isAdmin: false,
      hasBackedUpKeys: true,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /passphrase-changed when entering a backed-up-keys route with a locked keychain', async () => {
    world.keychainLocked = true;
    world.tokenValid = true; // token must be valid to reach the locked check

    const router = build();
    await router.push('/verify');

    expect(router.currentRoute.value.path).toBe('/passphrase-changed');
  });

  it('sends a locked user to /login first when the token is invalid (token check wins)', async () => {
    world.keychainLocked = true;
    world.tokenValid = false; // invalid token short-circuits before the locked check

    const router = build();
    await router.push('/verify');

    // Ordering guarantee: invalid token => /login, NOT /passphrase-changed.
    expect(router.currentRoute.value.path).toBe('/login');
    expect(captureMetric).toHaveBeenCalledWith('send.invalid.token');
    expect(validateBackedUpKeys).not.toHaveBeenCalled();
  });

  it('does NOT reach /passphrase-changed for an admin route (admin check wins before backed-up-keys)', async () => {
    world.keychainLocked = true;
    world.tokenValid = true;
    world.isAdmin = false; // non-admin on an admin route

    const router = build();
    await router.push('/admin/delete-data');

    // Admin route has no requiresBackedUpKeys, and the admin branch returns first.
    expect(router.currentRoute.value.path).toBe('/404');
  });

  it('does not redirect to /passphrase-changed when the keychain is unlocked and keys are backed up', async () => {
    world.keychainLocked = false;
    world.tokenValid = true;
    world.hasBackedUpKeys = true;

    const router = build();
    await router.push('/verify');

    expect(router.currentRoute.value.path).toBe('/verify');
  });

  it('sends an unlocked user without backed-up keys to /send/profile, not /passphrase-changed', async () => {
    world.keychainLocked = false;
    world.tokenValid = true;
    world.hasBackedUpKeys = false;

    const router = build();
    await router.push('/verify');

    // The locked branch is skipped; the "no backup" branch takes over.
    expect(router.currentRoute.value.path).toBe('/send/profile');
  });
});
