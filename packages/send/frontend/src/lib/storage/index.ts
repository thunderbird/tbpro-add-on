import { JwkKeyPair, StoredKey } from '@send-frontend/lib/keychain';
import { UserType } from '@send-frontend/types';
import LocalStorageAdapter from './LocalStorage';
import {
  decryptPassphrase,
  encryptPassphrase,
  EncryptedPassphrase,
  getOrCreatePassphraseKey,
} from './passphraseEncryption';

export interface StorageAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (k: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (k: string, v: any) => void;
  clear: () => void;
}

// Kept out of the class to avoid changing the structural type of Storage,
// which would break test mocks that construct Keychain-shaped objects.
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
   * Must be awaited before any call to getPassPhrase().
   * Reads the stored passphrase, decrypts it if it is in the encrypted
   * AES-GCM format, or migrates the legacy plaintext value by re-encrypting it.
   */
  async initializePassphrase(): Promise<void> {
    const stored = this.adapter.get(this.PASS_PHRASE);
    if (!stored) return;

    // Legacy plaintext format: { passPhrase: "..." }
    if (stored.passPhrase !== undefined) {
      const plain: string = stored.passPhrase ?? '';
      passPhraseCache.set(this, plain);
      // Migrate to encrypted format in place
      if (plain) {
        await this.storePassPhrase(plain);
      }
      return;
    }

    // Encrypted format: { iv: [...], data: [...] }
    if (stored.iv !== undefined && stored.data !== undefined) {
      const key = await getOrCreatePassphraseKey();
      if (key) {
        const plain = await decryptPassphrase(
          key,
          stored as EncryptedPassphrase
        );
        passPhraseCache.set(this, plain);
      }
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
    const key = await getOrCreatePassphraseKey();
    if (key) {
      const encrypted = await encryptPassphrase(key, passPhrase);
      this.adapter.set(this.PASS_PHRASE, encrypted);
    } else {
      // Fallback for environments without IndexedDB (e.g. tests)
      this.adapter.set(this.PASS_PHRASE, { passPhrase });
    }
    passPhraseCache.set(this, passPhrase);
  }

  getPassPhrase(): string {
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
