/**
 * Cross-context lock for the silent token refresh in auth-store.ts. See
 * issue #1022 (and its sibling lock, initFolderLock.ts / #1032).
 *
 * Why this exists: background.ts, the popup, and any web-app tab bridged
 * into the extension each load their OWN independent copy of the auth store
 * as a separate JS module instance (same reasoning as shared-pinia.ts's
 * per-context-singleton comment). The in-memory `inFlightRefresh` dedup in
 * auth-store.ts is therefore invisible across contexts. If the OIDC provider
 * rotates refresh tokens, two contexts calling signinSilent() at nearly the
 * same time race the rotation: the loser's now-superseded refresh token gets
 * `invalid_grant`, which reads as a genuine auth failure and signs the user
 * out.
 *
 * A refresh is a single token-endpoint round-trip, so a 10s TTL comfortably
 * covers a slow network while keeping the crashed-holder stall short
 * (initFolderLock uses 15s for a heavier delete+recreate sequence). Lock
 * mechanics live in storageLock.ts.
 */

import { createStorageLock } from '@send-frontend/lib/storageLock';

const lock = createStorageLock({
  keyPrefix: 'tbpro-refresh-lock',
  ttlMs: 10_000,
  // How often a waiting context re-checks whether the lock holder finished.
  pollIntervalMs: 150,
});

/**
 * Attempt to acquire the refresh lock for this account.
 *
 * Returns a token to pass to releaseRefreshLock() on success, or `null` if
 * another context currently holds an unexpired lock (i.e. is mid-refresh).
 */
export const acquireRefreshLock = lock.acquire;

/** Release a previously-acquired refresh lock. */
export const releaseRefreshLock = lock.release;

/**
 * Wait (bounded by the lock TTL) for the context that holds the refresh lock
 * to finish, after which the freshly-rotated token should be persisted.
 */
export const waitForRefreshLockRelease = lock.waitForRelease;
