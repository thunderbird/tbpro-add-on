/**
 * Shared cross-context lock over `browser.storage.local`, used by
 * refreshLock.ts (#1022) and initFolderLock.ts (#1032). Both locks live in
 * `browser.storage.local` because it is the one thing every extension context
 * (background, popup, bridged web-app tab) genuinely shares, so it's the only
 * place a lock that actually works across contexts can live.
 *
 * These are intentionally short-TTL locks, not queues or hard mutexes: if a
 * context dies while holding one (tab closed, background page recycled), the
 * next caller should be able to proceed after a few seconds rather than being
 * stuck forever. The tradeoff is a small window where two contexts could still
 * both proceed if one crashes at the exact wrong moment inside its TTL --
 * an acceptable residual risk for races that were previously unguarded 100%
 * of the time.
 */

interface LockRecord {
  token: string;
  expiresAt: number;
}

export interface StorageLockOptions {
  /** Storage key prefix; the account id is appended as `${prefix}:${id}`. */
  keyPrefix: string;
  /** How long a held lock is honored before being treated as abandoned. */
  ttlMs: number;
  /** How often waitForRelease re-checks the lock record. */
  pollIntervalMs?: number;
}

export interface StorageLock {
  acquire(accountId: string | undefined): Promise<string | null>;
  release(accountId: string | undefined, token: string): Promise<void>;
  waitForRelease(accountId: string | undefined): Promise<boolean>;
}

/**
 * Generate a unique token used to identify a lock holder.
 *
 * Prefers `crypto.randomUUID()` and falls back to a timestamp+random string in
 * environments without it (matches the fallback pattern already used in
 * keychain.ts).
 */
export function generateToken(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Whether `browser.storage.local` is available in the current context.
 *
 * A plain web-app tab with no sibling extension context has nothing to
 * coordinate with, so the locks treat a `false` here as "proceed as if the
 * lock did not exist".
 */
export function hasExtensionStorage(): boolean {
  return (
    typeof browser !== 'undefined' &&
    !!browser?.storage?.local &&
    typeof browser.storage.local.get === 'function'
  );
}

/**
 * Create a short-TTL cross-context lock stored in `browser.storage.local`,
 * keyed per account.
 *
 * - `acquire` returns a token to pass to `release` on success, or `null` if
 *   another context currently holds an unexpired lock. In any context without
 *   `browser.storage.local`, it always "succeeds" by returning a token that
 *   `release` will just no-op on -- there's nothing to coordinate with, so the
 *   guarded operation proceeds exactly as it did before the lock existed.
 * - `release` only clears the stored record if it still matches the token it
 *   was given -- if the lock already expired and a different context has since
 *   taken it over, it must not clear their lock out from under them.
 * - `waitForRelease` waits (bounded by the TTL) for the holder to finish.
 *   Resolves `true` once the lock record is gone or expired -- the holder
 *   released it, or died and the TTL lapsed -- or `false` if the lock is
 *   somehow still held when the wait budget runs out. Without extension
 *   storage there is nothing to wait on, so it resolves immediately.
 */
export function createStorageLock({
  keyPrefix,
  ttlMs,
  pollIntervalMs = 150,
}: StorageLockOptions): StorageLock {
  const storageKey = (accountId: string) => `${keyPrefix}:${accountId}`;

  const readRecord = async (key: string): Promise<LockRecord | undefined> =>
    (await browser.storage.local.get(key))?.[key] as LockRecord | undefined;

  return {
    async acquire(accountId) {
      if (!accountId || !hasExtensionStorage()) {
        return generateToken();
      }

      const key = storageKey(accountId);
      const now = Date.now();

      const existing = await readRecord(key);
      if (existing && existing.expiresAt > now) {
        // Someone else holds an unexpired lock for this account.
        return null;
      }

      const token = generateToken();
      const record: LockRecord = { token, expiresAt: now + ttlMs };
      await browser.storage.local.set({ [key]: record });

      // Guard against a rare concurrent-write race: two contexts can both
      // pass the `existing` check above in the same tick (there's no atomic
      // read-modify-write in the storage.local API), then both write. Re-read
      // after writing and only proceed if OUR token is the one that stuck.
      const confirmed = await readRecord(key);
      return confirmed?.token === token ? token : null;
    },

    async release(accountId, token) {
      if (!accountId || !hasExtensionStorage()) {
        return;
      }

      const key = storageKey(accountId);
      const existing = await readRecord(key);
      if (existing?.token === token) {
        await browser.storage.local.remove(key);
      }
    },

    async waitForRelease(accountId) {
      if (!accountId || !hasExtensionStorage()) {
        return true;
      }

      const key = storageKey(accountId);
      const deadline = Date.now() + ttlMs;

      for (;;) {
        const existing = await readRecord(key);
        if (!existing || existing.expiresAt <= Date.now()) {
          return true;
        }
        if (Date.now() >= deadline) {
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    },
  };
}
