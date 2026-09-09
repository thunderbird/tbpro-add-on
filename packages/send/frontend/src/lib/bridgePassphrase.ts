import { SEND_MESSAGE_TO_BRIDGE } from '@send-frontend/lib/const';

/**
 * Pull a passphrase shared from the web app via the token bridge into the
 * keychain.
 *
 * The web app (running in a browser tab) posts SEND_MESSAGE_TO_BRIDGE; the
 * add-on background stores its value in browser.storage.local under that key
 * (see background.ts). This moves that staged value into the keychain — i.e.
 * localStorage['lb/passphrase'], which every moz-extension page (background,
 * popup, management) shares — and clears the staged copy so it is consumed once.
 *
 * Runs only in an extension context where browser.storage.local exists; it is a
 * no-op in a plain web page (where `browser` is undefined). Safe to call from
 * any context that is about to restore keys, so the popup and background don't
 * depend on the management page having run the transfer first.
 *
 * @returns true if a bridged passphrase was found and stored, false otherwise.
 */
export async function pullBridgedPassphrase(keychain: {
  storePassPhrase: (passphrase: string) => Promise<void>;
}): Promise<boolean> {
  if (typeof browser === 'undefined' || !browser?.storage?.local) {
    return false;
  }

  try {
    const result = await browser.storage.local.get(SEND_MESSAGE_TO_BRIDGE);
    const passphrase = result?.[SEND_MESSAGE_TO_BRIDGE];
    if (!passphrase) {
      return false;
    }

    await keychain.storePassPhrase(passphrase);
    // Consume it once so a stale value can't linger in extension storage.
    await browser.storage.local.remove(SEND_MESSAGE_TO_BRIDGE);
    console.log('✅ Pulled bridged passphrase into the keychain');
    return true;
  } catch (error) {
    console.error('Error pulling bridged passphrase:', error);
    return false;
  }
}

/**
 * Stage a passphrase in extension storage for the bridge, exactly as the
 * background does when the web app posts SEND_MESSAGE_TO_BRIDGE.
 *
 * The management page runs the same frontend as the web app, but the
 * token-bridge content script is not injected into moz-extension pages, so a
 * window.postMessage from there never reaches the background. Writing the
 * staged value directly makes a passphrase set/re-wrap inside the extension
 * reach the other extension contexts on their next restore instead of leaving
 * them on the old passphrase.
 *
 * Runs only in an extension context; it is a no-op in a plain web page (where
 * `browser` is undefined) — there, the postMessage → content script → background
 * path does the staging instead.
 *
 * @returns true if the passphrase was staged, false otherwise.
 */
export async function stageBridgedPassphrase(
  passphrase: string
): Promise<boolean> {
  if (typeof browser === 'undefined' || !browser?.storage?.local) {
    return false;
  }

  try {
    await browser.storage.local.set({ [SEND_MESSAGE_TO_BRIDGE]: passphrase });
    console.log('✅ Staged passphrase for the bridge in extension storage');
    return true;
  } catch (error) {
    console.error('Error staging bridged passphrase:', error);
    return false;
  }
}

/**
 * Clear a staged bridged passphrase without consuming it into the keychain.
 *
 * Called when a stale passphrase is detected (keychain.locked after a failed
 * restore): the staged value is what fed the keychain, so leaving it in
 * extension storage would let pullBridgedPassphrase replay the old passphrase
 * back into the keychain on the next restore.
 *
 * Same guard semantics as pullBridgedPassphrase: no-op in a plain web page.
 *
 * @returns true if a staged value was found and removed, false otherwise.
 */
export async function clearBridgedPassphrase(): Promise<boolean> {
  if (typeof browser === 'undefined' || !browser?.storage?.local) {
    return false;
  }

  try {
    const result = await browser.storage.local.get(SEND_MESSAGE_TO_BRIDGE);
    if (!result?.[SEND_MESSAGE_TO_BRIDGE]) {
      return false;
    }

    await browser.storage.local.remove(SEND_MESSAGE_TO_BRIDGE);
    console.log('🧹 Cleared stale bridged passphrase from extension storage');
    return true;
  } catch (error) {
    console.error('Error clearing bridged passphrase:', error);
    return false;
  }
}
