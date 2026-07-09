import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The test env has no IndexedDB, so Storage would normally take its plaintext
// fallback. Inject a real AES-GCM key for getOrCreatePassphraseKey so the actual
// encrypt-at-rest branch runs; real encrypt/decrypt from the module are kept.
const holder = vi.hoisted(() => ({ key: null as CryptoKey | null }));

vi.mock('@send-frontend/lib/storage/passphraseEncryption', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@send-frontend/lib/storage/passphraseEncryption')
    >();
  return { ...actual, getOrCreatePassphraseKey: async () => holder.key };
});

import { Storage } from '@send-frontend/lib/storage/index';

describe('Storage passphrase — encrypted at rest', () => {
  beforeAll(async () => {
    holder.key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('persists ciphertext (not plaintext) and decrypts it from a fresh instance', async () => {
    const writer = new Storage();
    await writer.storePassPhrase('top secret phrase');

    // What lands in localStorage must be the encrypted payload, never plaintext.
    const raw = JSON.parse(localStorage.getItem('lb/passphrase') as string);
    expect(raw.passPhrase).toBeUndefined();
    expect(Array.isArray(raw.iv)).toBe(true);
    expect(Array.isArray(raw.data)).toBe(true);
    expect(JSON.stringify(raw)).not.toContain('secret');

    // A different instance (e.g. another extension page after reload) decrypts it.
    const reader = new Storage();
    await reader.initializePassphrase();
    expect(reader.getPassPhrase()).toBe('top secret phrase');
  });

  it('re-encrypts a legacy plaintext value on initializePassphrase (migration)', async () => {
    localStorage.setItem(
      'lb/passphrase',
      JSON.stringify({ passPhrase: 'legacy plaintext' })
    );

    const storage = new Storage();
    await storage.initializePassphrase();

    expect(storage.getPassPhrase()).toBe('legacy plaintext');
    // The at-rest value should now be the encrypted format, not plaintext.
    const raw = JSON.parse(localStorage.getItem('lb/passphrase') as string);
    expect(raw.passPhrase).toBeUndefined();
    expect(Array.isArray(raw.iv)).toBe(true);
  });
});
