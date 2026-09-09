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
 * out. `browser.storage.local` is the one thing all of those contexts
 * genuinely share, so it's the only place a lock that actually works across
 * contexts can live.
 *
 * This is intentionally a short-TTL lock, not a queue or a hard mutex: if a
 * context dies while holding it (tab closed, background page recycled), we
 * want the next refresh to be able to proceed after a few seconds rather
 * than being stuck forever. A refresh is a single token-endpoint round-trip,
 * so 10s comfortably covers a slow network while keeping the
 * crashed-holder stall short (initFolderLock uses 15s for a heavier
 * delete+recreate sequence).
 */

const LOCK_TTL_MS = 10_000;

// How often a waiting context re-checks whether the lock holder finished.
const LOCK_POLL_INTERVAL_MS = 150;

function lockStorageKey(accountId: string): string {
  return `tbpro-refresh-lock:${accountId}`;
}

interface LockRecord {
  token: string;
  expiresAt: number;
}

function generateToken(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
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
 * Attempt to acquire the refresh lock for this account.
 *
 * Returns a token to pass to releaseRefreshLock() on success, or `null` if
 * another context currently holds an unexpired lock (i.e. is mid-refresh).
 *
 * In any context without `browser.storage.local` (e.g. a plain web-app tab
 * with no sibling extension context to race against), this always
 * "succeeds" by returning a token that release() will just no-op on --
 * there's nothing to coordinate with, so the refresh proceeds exactly as it
 * did before this fix existed.
 */
export async function acquireRefreshLock(
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
export async function releaseRefreshLock(
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

/**
 * Wait (bounded by the lock TTL) for the context that holds the refresh lock
 * to finish. Resolves `true` once the lock record is gone or expired --
 * meaning the holder released it (or died and the TTL lapsed) and the
 * freshly-rotated token should now be persisted -- or `false` if the lock is
 * somehow still held when the wait budget runs out.
 *
 * Without extension storage there is nothing to wait on (acquire never
 * returns null there), so this resolves immediately.
 */
export async function waitForRefreshLockRelease(
  accountId: string | undefined
): Promise<boolean> {
  if (!accountId || !hasExtensionStorage()) {
    return true;
  }

  const key = lockStorageKey(accountId);
  const deadline = Date.now() + LOCK_TTL_MS;

  for (;;) {
    const existing = (await browser.storage.local.get(key))?.[key] as
      | LockRecord
      | undefined;

    if (!existing || existing.expiresAt <= Date.now()) {
      return true;
    }
    if (Date.now() >= deadline) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_INTERVAL_MS));
  }
}
