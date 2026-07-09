import { JwkKeyPair, StoredKey } from '@send-frontend/lib/keychain';
import { UserType } from '@send-frontend/types';
import LocalStorageAdapter from './LocalStorage';
import {
  decryptPassphrase,
  encryptPassphrase,
  EncryptedPassphrase,
  getOrCreatePassphraseKey,
  isEncryptedPassphrase,
} from './passphraseEncryption';

export interface StorageAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (k: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (k: string, v: any) => void;
  clear: () => void;
}

// In-memory plaintext passphrase cache, keyed by Storage instance. Populated by
// storePassPhrase() and initializePassphrase(); read by the synchronous
// getPassPhrase(). Kept module-scoped (not a class field) so the structural
// type of Storage is unchanged — test mocks that build Keychain-shaped objects
// keep working — and so the plaintext never lands in serialised storage.
const passPhraseCache = new WeakMap<Storage, string>();

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
    const stored = this.adapter.get(this.PASS_PHRASE);
    if (!stored) return;

    try {
      // Legacy plaintext format: { passPhrase: "..." }
      if (typeof stored.passPhrase === 'string') {
        const plain: string = stored.passPhrase;
        passPhraseCache.set(this, plain);
        // Migrate to the encrypted format in place.
        if (plain) {
          await this.storePassPhrase(plain);
        }
        return;
      }

      // Encrypted format: { iv: [...], data: [...] }
      if (isEncryptedPassphrase(stored)) {
        const key = await getOrCreatePassphraseKey();
        if (key) {
          const plain = await decryptPassphrase(key, stored);
          passPhraseCache.set(this, plain);
        }
      }
    } catch (error) {
      console.error('Could not initialize passphrase from storage:', error);
    }
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
    if (key) {
      const encrypted: EncryptedPassphrase = await encryptPassphrase(
        key,
        passPhrase
      );
      this.adapter.set(this.PASS_PHRASE, encrypted);
    } else {
      // Fallback for environments without Web Crypto / IndexedDB (e.g. tests):
      // persist plaintext so the value is at least not lost. Real browser and
      // extension contexts always have crypto storage and take the branch above.
      this.adapter.set(this.PASS_PHRASE, { passPhrase });
    }
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
