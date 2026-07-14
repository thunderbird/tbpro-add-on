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
