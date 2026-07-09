import { Storage } from '@send-frontend/lib/storage/index';
import { beforeEach, describe, expect, it } from 'vitest';

// The test env (happy-dom + node webcrypto) has no IndexedDB, so Storage takes
// the plaintext-fallback branch of storePassPhrase. These tests therefore cover
// the cache + migration behavior that is environment-independent; the AES-GCM
// at-rest encryption itself is covered by passphraseEncryption.test.ts.
describe('Storage passphrase', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and reads a passphrase back within a session', async () => {
    const storage = new Storage();
    await storage.storePassPhrase('correct horse battery staple');
    expect(storage.getPassPhrase()).toBe('correct horse battery staple');
  });

  it('returns empty from a fresh instance until the cache is hydrated', async () => {
    const writer = new Storage();
    await writer.storePassPhrase('shared secret');

    // A second instance has not hydrated its cache yet.
    const reader = new Storage();
    expect(reader.getPassPhrase()).toBe('');

    await reader.initializePassphrase();
    expect(reader.getPassPhrase()).toBe('shared secret');
  });

  it('migrates a legacy plaintext value on initializePassphrase', async () => {
    localStorage.setItem(
      'lb/passphrase',
      JSON.stringify({ passPhrase: 'legacy plaintext' })
    );

    const storage = new Storage();
    expect(storage.getPassPhrase()).toBe(''); // not hydrated yet
    await storage.initializePassphrase();
    expect(storage.getPassPhrase()).toBe('legacy plaintext');
  });

  it('clear() wipes the cached passphrase', async () => {
    const storage = new Storage();
    await storage.storePassPhrase('to be cleared');
    await storage.clear();
    expect(storage.getPassPhrase()).toBe('');
  });
});
