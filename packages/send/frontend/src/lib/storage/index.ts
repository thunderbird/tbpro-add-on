import { JwkKeyPair, StoredKey } from '@send-frontend/lib/keychain';
import { UserType } from '@send-frontend/types';
import LocalStorageAdapter from './LocalStorage';
import {
  decryptPassphrase,
  encryptPassphrase,
  EncryptedPassphrase,
  getExistingPassphraseKey,
  getOrCreatePassphraseKey,
  isEncryptedPassphrase,
} from './passphraseEncryption';

export interface StorageAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (k: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (k: string, v: any) => void;
  remove?: (k: string) => void;
  clear: () => void;
}

// In-memory plaintext passphrase cache, keyed by Storage instance. Populated by
// storePassPhrase() and initializePassphrase(); read by the synchronous
// getPassPhrase(). Kept module-scoped (not a class field) so the structural
// type of Storage is unchanged — test mocks that build Keychain-shaped objects
// keep working — and so the plaintext never lands in serialised storage.
const passPhraseCache = new WeakMap<Storage, string>();

// Remove the at-rest passphrase payload (not the in-memory cache). Module-
// scoped (not a class method) for the same structural-typing reason as the
// cache above.
function removeStoredPassphrase(storage: Storage): void {
  if (typeof storage.adapter.remove === 'function') {
    storage.adapter.remove(storage.PASS_PHRASE);
  } else {
    storage.adapter.set(storage.PASS_PHRASE, null);
  }
}

export class Storage {
  USER_KEY = 'lb/user';
  OTHER_KEYS_KEY = 'lb/keys';
  RSA_KEYS_KEY = 'lb/rsa';
  PASS_PHRASE = 'lb/passphrase';
  adapter: StorageAdapter;

  constructor(Adapter = LocalStorageAdapter) {
    this.adapter = new Adapter();
  }

  /**
   * Hydrate the in-memory passphrase cache from storage. Must be awaited before
   * getPassPhrase() in a context that did not itself call storePassPhrase this
   * session (e.g. after a page reload, or in the popup/background). It:
   *  - decrypts the AES-GCM payload written by storePassPhrase, or
   *  - migrates a legacy plaintext `{ passPhrase }` value by caching it and
   *    re-encrypting it in place.
   * A decryption failure (e.g. the IndexedDB key was cleared) is swallowed so a
   * missing/undecryptable passphrase simply reads back as empty.
   */
  async initializePassphrase(): Promise<void> {
    // Fast path: this instance is already hydrated (storePassPhrase or a
    // previous initializePassphrase ran). Skips the IndexedDB round-trip that
    // would otherwise happen on every router navigation.
    if (passPhraseCache.has(this)) return;

    const stored = this.adapter.get(this.PASS_PHRASE);
    if (!stored) return;

    // Legacy plaintext format: { passPhrase: "..." }
    if (typeof stored.passPhrase === 'string') {
      const plain: string = stored.passPhrase;
      passPhraseCache.set(this, plain);
      // Migrate to the encrypted format in place.
      if (plain) {
        try {
          await this.storePassPhrase(plain);
        } catch (error) {
          console.error('Could not migrate plaintext passphrase:', error);
        }
      }
      return;
    }

    if (!isEncryptedPassphrase(stored)) return;

    // Encrypted format: { iv: [...], data: [...] }
    let key: CryptoKey | null;
    try {
      key = await getExistingPassphraseKey();
    } catch (error) {
      // Infrastructure error (IndexedDB failed to open): possibly transient, so
      // leave the stored payload alone and read back as empty for now.
      console.error('Could not open the passphrase key store:', error);
      return;
    }

    if (key) {
      try {
        const plain = await decryptPassphrase(key, stored);
        passPhraseCache.set(this, plain);
        return;
      } catch (error) {
        console.error('Could not decrypt the stored passphrase:', error);
        // Fall through to self-heal: AES-GCM decryption only fails when the
        // key or payload is wrong, which does not fix itself.
      }
    }

    // Self-heal: ciphertext without a matching key (e.g. the browser evicted
    // IndexedDB but kept localStorage, or a restored backup carried ciphertext
    // into a fresh profile) can never be decrypted. Discard it so the app
    // converges to the ordinary "no passphrase stored" state — the user can
    // recover access from the server-side key backup — instead of retrying
    // (and failing) on every load forever.
    console.warn('Stored passphrase is not decryptable; discarding it.');
    removeStoredPassphrase(this);
  }

  async storeUser(userObj: UserType): Promise<void> {
    this.adapter.set(this.USER_KEY, { ...userObj });
  }

  async getUserFromLocalStorage(): Promise<UserType> {
    return this.adapter.get(this.USER_KEY);
  }

  async storeKeys(keysObj: StoredKey): Promise<void> {
    this.adapter.set(this.OTHER_KEYS_KEY, { ...keysObj });
  }

  async storePassPhrase(passPhrase: string): Promise<void> {
    // Populate the cache synchronously, before the async encryption, so callers
    // that read getPassPhrase() right after calling this without awaiting it
    // (e.g. makeBackup) still see the value — encryption opens IndexedDB, which
    // would otherwise leave the cache empty until a later microtask.
    passPhraseCache.set(this, passPhrase);

    const key = await getOrCreatePassphraseKey();
    if (!key) {
      // No crypto storage (Web Crypto / IndexedDB unavailable — non-browser
      // test environments): keep the passphrase in memory only. Plaintext is
      // NEVER persisted; real browser and extension contexts always have
      // crypto storage and persist the encrypted payload below.
      return;
    }
    const encrypted: EncryptedPassphrase = await encryptPassphrase(
      key,
      passPhrase
    );
    this.adapter.set(this.PASS_PHRASE, encrypted);
  }

  getPassPhrase(): string {
    // Reads the decrypted value from the in-memory cache. Callers must have run
    // storePassPhrase() or initializePassphrase() first (decryption is async and
    // cannot happen in this synchronous getter).
    return passPhraseCache.get(this) ?? '';
  }

  async loadKeys(): Promise<StoredKey> {
    return this.adapter.get(this.OTHER_KEYS_KEY);
  }

  async storeKeypair(keypair: JwkKeyPair) {
    this.adapter.set(this.RSA_KEYS_KEY, { ...keypair });
  }

  async loadKeypair(): Promise<JwkKeyPair> {
    return this.adapter.get(this.RSA_KEYS_KEY);
  }

  async clear(): Promise<void> {
    passPhraseCache.delete(this);
    return this.adapter.clear();
  }

  async export() {
    // primarily for debugging or moving a user to another device
    // prior to getting multiple-device login implemented
    const user = await this.getUserFromLocalStorage();
    const keypair = await this.loadKeypair();
    const keys = await this.loadKeys();
    return {
      user,
      keypair,
      keys,
    };
  }
}
