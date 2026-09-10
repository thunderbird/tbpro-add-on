import {
  generateResetKeyBlob,
  Keychain,
  Util,
} from '@send-frontend/lib/keychain';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Regression test for issue #1116 (safe "Reset Access" — the client "write-new"
// half).
//
// The safe reset generates a COMPLETE replacement key blob client-side BEFORE
// asking the server to swap it in. This guarantees the server never has to null
// the recovery material and hope re-provisioning finishes: the replacement
// already exists in hand.
//
// The blob is built on a throwaway scratch keychain so a failed server swap
// never leaves the caller's live keychain half-scrubbed. These tests verify the
// blob is complete (no missing/empty fields) and is actually decryptable with
// the freshly generated passphrase (otherwise "reset" would still lock the user
// out).
// ---------------------------------------------------------------------------

describe('generateResetKeyBlob — client write-new half of safe reset (#1116)', () => {
  it('produces a complete replacement blob with no empty fields', async () => {
    const blob = await generateResetKeyBlob('correct horse battery');

    expect(blob.publicKey).toBeTruthy();
    expect(blob.backupKeypair).toBeTruthy();
    expect(blob.backupKeystring).toBeTruthy();
    expect(blob.backupSalt).toBeTruthy();
    // A brand-new key has no container keys, so this is the serialized empty map.
    expect(blob.backupContainerKeys).toBe('{}');
  });

  it('throws (never produces a wipe) when no passphrase is supplied', async () => {
    await expect(generateResetKeyBlob('')).rejects.toThrow();
  });

  it('produces a blob whose password-wrapped content key is decryptable with the new passphrase', async () => {
    const passphrase = 'a-recoverable-phrase';
    const blob = await generateResetKeyBlob(passphrase);

    // The blob must be genuinely recoverable — otherwise "reset" would still
    // lock the user out. Unwrap the content key exactly as restore does.
    const keychain = new Keychain();
    const salt = Util.base64ToArrayBuffer(blob.backupSalt);
    await expect(
      keychain.password.unwrapContentKey(blob.backupKeystring, passphrase, salt)
    ).resolves.toBeTruthy();
  });

  it('generates a distinct keypair on each reset', async () => {
    const first = await generateResetKeyBlob('p1');
    const second = await generateResetKeyBlob('p2');

    expect(first.publicKey).not.toBe(second.publicKey);
  });

  it('does not include any stale container keys in the new blob', async () => {
    const blob = await generateResetKeyBlob('fresh-start');

    // Empty serialized map — a brand-new key owns nothing yet.
    expect(JSON.parse(blob.backupContainerKeys)).toEqual({});
  });
});
