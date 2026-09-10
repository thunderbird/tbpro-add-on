import {
  decryptPassphrase,
  encryptPassphrase,
  isEncryptedPassphrase,
} from '@send-frontend/lib/storage/passphraseEncryption';
import { beforeAll, describe, expect, it } from 'vitest';

async function freshKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

describe('passphrase encryption', () => {
  let key: CryptoKey;

  beforeAll(async () => {
    key = await freshKey();
  });

  it('round-trips a passphrase and never exposes the plaintext in the payload', async () => {
    const secret = 'view gather funny intact butter peasant';

    const enc = await encryptPassphrase(key, secret);

    expect(isEncryptedPassphrase(enc)).toBe(true);
    expect(enc.iv).toHaveLength(12);
    // The serialised payload must not contain any plaintext word.
    expect(JSON.stringify(enc)).not.toContain('gather');

    const dec = await decryptPassphrase(key, enc);
    expect(dec).toBe(secret);
  });

  it('uses a fresh IV for every encryption (no IV reuse)', async () => {
    const a = await encryptPassphrase(key, 'same input');
    const b = await encryptPassphrase(key, 'same input');

    expect(a.iv).not.toEqual(b.iv);
    expect(a.data).not.toEqual(b.data);
  });

  it('rejects tampered ciphertext (AES-GCM auth tag)', async () => {
    const enc = await encryptPassphrase(key, 'secret');
    enc.data[0] = enc.data[0] ^ 0xff; // flip a byte

    await expect(decryptPassphrase(key, enc)).rejects.toBeDefined();
  });

  it('cannot be decrypted with a different key', async () => {
    const enc = await encryptPassphrase(key, 'secret');
    const otherKey = await freshKey();

    await expect(decryptPassphrase(otherKey, enc)).rejects.toBeDefined();
  });

  it('isEncryptedPassphrase distinguishes formats', () => {
    expect(isEncryptedPassphrase({ iv: [1], data: [2] })).toBe(true);
    expect(isEncryptedPassphrase({ passPhrase: 'plain' })).toBe(false);
    expect(isEncryptedPassphrase(null)).toBe(false);
    expect(isEncryptedPassphrase('string')).toBe(false);
  });
});
