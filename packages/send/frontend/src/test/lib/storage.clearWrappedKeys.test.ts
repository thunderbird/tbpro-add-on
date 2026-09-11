import { Storage, StorageAdapter } from '@send-frontend/lib/storage';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Uses an in-memory adapter instead of LocalStorageAdapter because
 * localStorage is not available in this Node test environment (see the
 * pre-existing storage.test.ts failures). This keeps the test deterministic.
 */
class MemoryAdapter implements StorageAdapter {
  store = new Map<string, unknown>();

  get(k: string) {
    return this.store.has(k) ? this.store.get(k) : null;
  }
  set(k: string, v: unknown) {
    this.store.set(k, v);
  }
  remove(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
  keys() {
    return [...this.store.keys()];
  }
}

describe('Storage.clearKeys', () => {
  let storage: Storage;
  let adapter: MemoryAdapter;

  beforeEach(async () => {
    storage = new Storage(MemoryAdapter);
    adapter = storage.adapter as MemoryAdapter;
    await storage.storeUser({ id: '12345', email: 'ned@ryerson.com' });
    await storage.storeKeys({ 100: 'abc' });
    await storage.storeKeypair({ publicKey: 'abc123', privateKey: 'xyz789' });
    await storage.storePassPhrase('alpha bravo charlie delta echo foxtrot');
  });

  it('removes both lb/keys and lb/passphrase', async () => {
    await storage.clearKeys();

    expect(adapter.get('lb/keys')).toBeNull();
    expect(adapter.get('lb/passphrase')).toBeNull();
    expect(await storage.loadKeys()).toBeNull();
    expect(storage.getPassPhrase()).toBe('');
  });

  it('leaves user and keypair intact', async () => {
    await storage.clearKeys();

    expect(await storage.getUserFromLocalStorage()).toEqual({
      id: '12345',
      email: 'ned@ryerson.com',
    });
    expect(await storage.loadKeypair()).toEqual({
      publicKey: 'abc123',
      privateKey: 'xyz789',
    });
  });
});
