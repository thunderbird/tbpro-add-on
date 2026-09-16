/**
 * Shared helpers for the cross-context `browser.storage.local` locks used by
 * refreshLock.ts (#1022) and initFolderLock.ts (#1032). Both locks live in
 * `browser.storage.local` because it is the one thing every extension context
 * (background, popup, bridged web-app tab) genuinely shares, and both need the
 * same two primitives: a way to tell whether that shared storage is even
 * available in the current context, and a unique-enough lock token.
 */

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
