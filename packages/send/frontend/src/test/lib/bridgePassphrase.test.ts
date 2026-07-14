import { pullBridgedPassphrase } from '@send-frontend/lib/bridgePassphrase';
import { SEND_MESSAGE_TO_BRIDGE } from '@send-frontend/lib/const';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A minimal keychain stand-in: pullBridgedPassphrase only needs storePassPhrase.
function makeKeychain(storePassPhrase = vi.fn().mockResolvedValue(undefined)) {
  return { storePassPhrase };
}

// Install a fake `browser.storage.local` whose get() returns `stored`.
function stubBrowser(stored: Record<string, unknown>) {
  const get = vi.fn().mockResolvedValue(stored);
  const remove = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('browser', { storage: { local: { get, remove } } });
  return { get, remove };
}

describe('pullBridgedPassphrase', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stores a staged passphrase in the keychain and consumes it once', async () => {
    const { remove } = stubBrowser({ [SEND_MESSAGE_TO_BRIDGE]: 'word one two' });
    const keychain = makeKeychain();

    const result = await pullBridgedPassphrase(keychain);

    expect(result).toBe(true);
    expect(keychain.storePassPhrase).toHaveBeenCalledWith('word one two');
    // The staged value is removed so it can only be consumed once.
    expect(remove).toHaveBeenCalledWith(SEND_MESSAGE_TO_BRIDGE);
  });

  it('is a no-op when no passphrase is staged', async () => {
    const { remove } = stubBrowser({});
    const keychain = makeKeychain();

    const result = await pullBridgedPassphrase(keychain);

    expect(result).toBe(false);
    expect(keychain.storePassPhrase).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('returns false outside an extension context (no browser global)', async () => {
    vi.stubGlobal('browser', undefined);
    const keychain = makeKeychain();

    const result = await pullBridgedPassphrase(keychain);

    expect(result).toBe(false);
    expect(keychain.storePassPhrase).not.toHaveBeenCalled();
  });

  it('returns false and does not throw if storing the passphrase fails', async () => {
    stubBrowser({ [SEND_MESSAGE_TO_BRIDGE]: 'word one two' });
    const keychain = makeKeychain(
      vi.fn().mockRejectedValue(new Error('storage full'))
    );

    const result = await pullBridgedPassphrase(keychain);

    expect(result).toBe(false);
  });
});
