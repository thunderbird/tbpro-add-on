import { Storage } from '@send-frontend/lib/storage/index';
import { beforeEach, describe, expect, it } from 'vitest';
import { installLocalStorageMock } from '../setup/localStorageMock';

// This vitest env exposes neither localStorage nor IndexedDB (see the note in
// keychain.restore-race.test.ts), so install an in-memory localStorage. With
// no crypto storage available, storePassPhrase keeps the passphrase in memory
// only (plaintext is never persisted). These tests cover that cache behavior
// plus legacy migration; the AES-GCM at-rest encryption itself is covered by
// passphraseEncryption.test.ts and storagePassphrase.encrypted.test.ts.
installLocalStorageMock();

describe('Storage passphrase', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and reads a passphrase back within a session', async () => {
    const storage = new Storage();
    await storage.storePassPhrase('correct horse battery staple');
    expect(storage.getPassPhrase()).toBe('correct horse battery staple');
  });

  it('never persists plaintext when crypto storage is unavailable', async () => {
    const writer = new Storage();
    await writer.storePassPhrase('shared secret');

    // In-memory only: nothing may land in localStorage without encryption.
    expect(localStorage.getItem('lb/passphrase')).toBeNull();

    // The writer still reads it back from its cache…
    expect(writer.getPassPhrase()).toBe('shared secret');

    // …but a fresh instance has nothing to hydrate from.
    const reader = new Storage();
    await reader.initializePassphrase();
    expect(reader.getPassPhrase()).toBe('');
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
