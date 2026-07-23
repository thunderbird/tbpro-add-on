/**
 * Cross-context lock for the default-folder delete+recreate branch in
 * init.ts. See issue #1032 (and its ancestor, #930).
 *
 * Why this exists: background.ts, the popup, and any web-app tab bridged
 * into the extension each load their OWN independent copy of init.ts as a
 * separate JS module instance (same reasoning as shared-pinia.ts's
 * per-context-singleton comment). A plain in-memory flag in one of those
 * copies is invisible to the others. `browser.storage.local` is the one
 * thing all of those contexts genuinely share, so it's the only place a
 * lock that actually works across contexts can live.
 *
 * This is intentionally a short-TTL lock, not a queue or a hard mutex: if a
 * context dies while holding it (tab closed, background page recycled), we
 * want the next init() call to be able to proceed after a few seconds
 * rather than being stuck forever. The tradeoff is a small window where two
 * contexts could still both proceed if one crashes at the exact wrong
 * moment inside its TTL -- that's an acceptable residual risk for a race
 * that was previously unguarded 100% of the time.
 */

const LOCK_TTL_MS = 15_000;

function lockStorageKey(accountId: string): string {
  return `tbpro-init-folder-lock:${accountId}`;
}

interface LockRecord {
  token: string;
  expiresAt: number;
}

function generateToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (matches the
  // fallback pattern already used in keychain.ts).
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hasExtensionStorage(): boolean {
  return (
    typeof browser !== 'undefined' &&
    !!browser?.storage?.local &&
    typeof browser.storage.local.get === 'function'
  );
}

/**
 * Attempt to acquire the default-folder lock for this account.
 *
 * Returns a token to pass to releaseDefaultFolderLock() on success, or
 * `null` if another context currently holds an unexpired lock.
 *
 * In any context without `browser.storage.local` (e.g. a plain web-app tab
 * with no sibling extension context to race against), this always
 * "succeeds" by returning a token that release() will just no-op on --
 * there's nothing to coordinate with, so the delete+recreate branch proceeds
 * exactly as it did before this fix existed.
 */
export async function acquireDefaultFolderLock(
  accountId: string | undefined
): Promise<string | null> {
  if (!accountId || !hasExtensionStorage()) {
    return generateToken();
  }

  const key = lockStorageKey(accountId);
  const now = Date.now();

  const existing = (await browser.storage.local.get(key))?.[key] as
    | LockRecord
    | undefined;

  if (existing && existing.expiresAt > now) {
    // Someone else holds an unexpired lock for this account.
    return null;
  }

  const token = generateToken();
  const record: LockRecord = { token, expiresAt: now + LOCK_TTL_MS };
  await browser.storage.local.set({ [key]: record });

  // Guard against a rare concurrent-write race: two contexts can both pass
  // the `existing` check above in the same tick (there's no atomic
  // read-modify-write in the storage.local API), then both write. Re-read
  // after writing and only proceed if OUR token is the one that stuck.
  const confirmed = (await browser.storage.local.get(key))?.[key] as
    | LockRecord
    | undefined;

  return confirmed?.token === token ? token : null;
}

/**
 * Release a previously-acquired lock. Only clears the stored record if it
 * still matches the token we were given -- if the lock already expired and
 * a different context has since taken it over, we must not clear their
 * lock out from under them.
 */
export async function releaseDefaultFolderLock(
  accountId: string | undefined,
  token: string
): Promise<void> {
  if (!accountId || !hasExtensionStorage()) {
    return;
  }

  const key = lockStorageKey(accountId);
  const existing = (await browser.storage.local.get(key))?.[key] as
    | LockRecord
    | undefined;

  if (existing?.token === token) {
    await browser.storage.local.remove(key);
  }
}
