import { JwkKeyPair, StoredKey } from '@send-frontend/lib/keychain';
import { UserType } from '@send-frontend/types';
import LocalStorageAdapter from './LocalStorage';

export interface StorageAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (k: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (k: string, v: any) => void;
  remove: (k: string) => void;
  clear: () => void;
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
    this.adapter.set(this.PASS_PHRASE, { passPhrase });
  }

  getPassPhrase(): string {
    const keys = this.adapter.get(this.PASS_PHRASE);
    return keys?.passPhrase || '';
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

  /**
   * Removes the stale key material — the wrapped (container) keys and the
   * cached passphrase — while leaving the user/session intact. Used when the
   * passphrase changed on another device: clearing both lets the normal
   * validation/restore flow start fresh (prompt for the new passphrase and
   * re-fetch keys from the server backup) instead of retrying the stale one.
   */
  async clearKeys(): Promise<void> {
    this.adapter.remove(this.OTHER_KEYS_KEY);
    this.adapter.remove(this.PASS_PHRASE);
  }

  async clear(): Promise<void> {
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
