/**
 * Cross-context lock for the default-folder delete+recreate branch in
 * init.ts. See issue #1032 (and its ancestor, #930; sibling lock:
 * refreshLock.ts / #1022).
 *
 * Why this exists: background.ts, the popup, and any web-app tab bridged
 * into the extension each load their OWN independent copy of init.ts as a
 * separate JS module instance (same reasoning as shared-pinia.ts's
 * per-context-singleton comment). A plain in-memory flag in one of those
 * copies is invisible to the others.
 *
 * The 15s TTL covers the heavier delete+recreate sequence (refreshLock uses
 * 10s for a single token round-trip). Lock mechanics live in storageLock.ts.
 */

import { createStorageLock } from '@send-frontend/lib/storageLock';

const lock = createStorageLock({
  keyPrefix: 'tbpro-init-folder-lock',
  ttlMs: 15_000,
});

/**
 * Attempt to acquire the default-folder lock for this account.
 *
 * Returns a token to pass to releaseDefaultFolderLock() on success, or
 * `null` if another context currently holds an unexpired lock.
 */
export const acquireDefaultFolderLock = lock.acquire;

/** Release a previously-acquired default-folder lock. */
export const releaseDefaultFolderLock = lock.release;
