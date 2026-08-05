/**
 * Reproduction tests for the passphrase-lockout race conditions in restoreKeys.
 *
 * These tests target the REAL `restoreKeys` (src/lib/keychain.ts) against a real
 * `Keychain` instance, driving the actual failure paths that flip
 * `keychain.locked = true` and land the user on PassphraseChanged.vue.
 *
 * They are written to FAIL against current source, documenting the bugs:
 *
 *   BUG 1 (over-broad catch): restoreKeys' try/catch sets locked=true on ANY
 *          throw inside the decrypt/load/store block, including transient
 *          non-passphrase failures (crypto blip, storage write error). A correct
 *          passphrase should NOT produce a permanent "keys are incorrect" lock
 *          on a transient error.
 *
 *   BUG 2 (no single-flight): concurrent restoreKeys calls on the shared
 *          singleton keychain can interleave; if one leg hits a transient error
 *          it locks the keychain for the other (successful) leg too.
 *
 *   BUG 3 (locked never reset): a later successful restore does not clear a
 *          previously-set locked flag, so one blip sticks until full reload.
 *
 * Once keychain.ts is fixed (single-flight + narrowed catch + reset-on-success),
 * these become the regression guard.
 */
import { Keychain, restoreKeys } from '@send-frontend/lib/keychain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A backup payload shape that restoreKeys destructures. The exact ciphertext
// doesn't matter for these tests because we control decrypt behaviour by spying
// on the keychain crypto methods (unwrapContentKey / decryptBackup) instead.
const BACKUP_RESPONSE = {
  backupContainerKeys: JSON.stringify({}),
  backupKeypair: JSON.stringify({ publicKey: 'pub', privateKey: 'priv' }),
  backupKeystring: 'wrapped-key',
  backupSalt: 'c2FsdA==', // base64 "salt"
};

// Minimal ApiConnection stand-in: restoreKeys only calls api.call('users/backup').
const makeApi = (response: unknown = BACKUP_RESPONSE) =>
  ({
    call: vi.fn(async () => response),
  }) as never;

/**
 * Wire a Keychain so decryptAll succeeds deterministically:
 *  - password.unwrapContentKey -> a dummy key
 *  - backup.decryptBackup -> a valid JWK-ish object
 *  - load/store -> no-op success
 * Individual tests then override one leg to throw, simulating a transient error.
 */
function makeHealthyKeychain(passphrase = 'correct horse battery staple'): Keychain {
  const kc = new Keychain();
  // Avoid touching real localStorage (not wired up in this test env, same gap
  // that breaks the storage.test.ts suite). restoreKeys only needs a truthy
  // passphrase via getPassphraseValue().
  vi.spyOn(kc, 'getPassphraseValue').mockReturnValue(passphrase);

  vi.spyOn(kc.password, 'unwrapContentKey').mockResolvedValue(
    'content-key' as never
  );
  vi.spyOn(kc.backup, 'decryptBackup').mockResolvedValue({
    kty: 'RSA',
  } as never);
  vi.spyOn(kc, 'load').mockResolvedValue(true);
  vi.spyOn(kc, 'store').mockResolvedValue(undefined);

  return kc;
}

describe('restoreKeys lockout races', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('BUG 1: a transient storage error with a CORRECT passphrase must not permanently lock the keychain', async () => {
    const kc = makeHealthyKeychain();
    // Simulate a transient localStorage write failure (e.g. quota / race on
    // the shared storage), NOT a wrong passphrase. decrypt already succeeded.
    vi.spyOn(kc, 'store').mockRejectedValueOnce(
      new Error('QuotaExceededError: transient write failure')
    );

    await expect(restoreKeys(kc, makeApi())).rejects.toThrow();

    // DESIRED behaviour: transient/storage failures should not be reported as
    // "your keys are incorrect". Current source flips locked=true unconditionally.
    expect(kc.locked).toBe(false);
  });

  it('BUG 1b: a transient WebCrypto blip during decrypt must not lock a correct passphrase', async () => {
    const kc = makeHealthyKeychain();
    // decryptBackup throws a non-passphrase, transient-style error AFTER unwrap
    // succeeded (so the passphrase itself was valid).
    vi.spyOn(kc.backup, 'decryptBackup').mockRejectedValueOnce(
      new Error('OperationError: transient subtle-crypto failure')
    );

    await expect(restoreKeys(kc, makeApi())).rejects.toThrow();

    expect(kc.locked).toBe(false);
  });

  it('BUG 3: a successful restore must clear a previously-set locked flag (no sticky lock)', async () => {
    const kc = makeHealthyKeychain();

    // First attempt: transient failure sets locked=true (today's behaviour).
    vi.spyOn(kc, 'store').mockRejectedValueOnce(new Error('transient'));
    await expect(restoreKeys(kc, makeApi())).rejects.toThrow();

    // Second attempt: everything healthy, restore succeeds.
    await expect(restoreKeys(kc, makeApi())).resolves.not.toThrow();

    // DESIRED: a successful restore recovers the keychain. Current source never
    // resets locked=false, so it stays stuck until a fresh Keychain is built.
    expect(kc.locked).toBe(false);
  });

  it('BUG 2: concurrent restores collapse into a single operation (single-flight)', async () => {
    const kc = makeHealthyKeychain();

    // Two callers hit restoreKeys on the SAME singleton (router auto-restore +
    // background/init restore during a rapid login). With single-flight they
    // must collapse into ONE underlying restore rather than each independently
    // mutating shared keychain state and racing store().
    const storeSpy = kc.store as unknown as ReturnType<typeof vi.fn>;

    const [a, b] = [restoreKeys(kc, makeApi()), restoreKeys(kc, makeApi())];
    // Overlapping callers share the exact same in-flight promise.
    expect(a).toBe(b);

    await Promise.all([a, b]);

    // Only one real restore ran despite two callers.
    expect(storeSpy).toHaveBeenCalledTimes(1);
    expect(kc.locked).toBe(false);
  });

  it('BUG 2b: a transient failure during a concurrent restore does not lock, and a retry recovers', async () => {
    const kc = makeHealthyKeychain();

    // The shared in-flight operation blips transiently on its first run.
    let storeCalls = 0;
    vi.spyOn(kc, 'store').mockImplementation(async () => {
      storeCalls += 1;
      if (storeCalls === 1) {
        throw new Error('transient write race');
      }
      return undefined;
    });

    // Two overlapping callers share one operation; both see the transient
    // rejection, but the keychain must NOT be locked (valid passphrase).
    const results = await Promise.allSettled([
      restoreKeys(kc, makeApi()),
      restoreKeys(kc, makeApi()),
    ]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(kc.locked).toBe(false);

    // A fresh restore after the in-flight cleared recovers cleanly.
    await expect(restoreKeys(kc, makeApi())).resolves.not.toThrow();
    expect(kc.locked).toBe(false);
  });

  it('control: a genuinely wrong passphrase (unwrap fails) SHOULD lock the keychain', async () => {
    const kc = new Keychain();
    vi.spyOn(kc, 'getPassphraseValue').mockReturnValue('wrong passphrase');
    // Unwrapping the content key with the wrong password is the real
    // "incorrect passphrase" signal — this one is SUPPOSED to lock.
    vi.spyOn(kc.password, 'unwrapContentKey').mockRejectedValue(
      new Error('OperationError: unwrap failed (bad password)')
    );

    await expect(restoreKeys(kc, makeApi())).rejects.toThrow();

    expect(kc.locked).toBe(true);
  });
});
