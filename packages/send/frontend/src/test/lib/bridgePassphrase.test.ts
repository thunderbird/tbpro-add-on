import {
  clearBridgedPassphrase,
  pullBridgedPassphrase,
  stageBridgedPassphrase,
} from '@send-frontend/lib/bridgePassphrase';
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
  const set = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('browser', { storage: { local: { get, remove, set } } });
  return { get, remove, set };
}

describe('pullBridgedPassphrase', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stores a staged passphrase in the keychain and consumes it once', async () => {
    const { remove } = stubBrowser({
      [SEND_MESSAGE_TO_BRIDGE]: 'word one two',
    });
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

describe('stageBridgedPassphrase', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stages the passphrase in extension storage', async () => {
    const { set } = stubBrowser({});

    const result = await stageBridgedPassphrase('word one two');

    expect(result).toBe(true);
    expect(set).toHaveBeenCalledWith({
      [SEND_MESSAGE_TO_BRIDGE]: 'word one two',
    });
  });

  it('is a no-op outside an extension context (no browser global)', async () => {
    vi.stubGlobal('browser', undefined);

    const result = await stageBridgedPassphrase('word one two');

    expect(result).toBe(false);
  });

  it('returns false and does not throw if the storage write fails', async () => {
    const set = vi.fn().mockRejectedValue(new Error('storage full'));
    vi.stubGlobal('browser', { storage: { local: { set } } });

    const result = await stageBridgedPassphrase('word one two');

    expect(result).toBe(false);
  });
});

describe('clearBridgedPassphrase', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('removes a staged passphrase so it cannot be replayed', async () => {
    const { remove } = stubBrowser({ [SEND_MESSAGE_TO_BRIDGE]: 'old stale' });

    const result = await clearBridgedPassphrase();

    expect(result).toBe(true);
    expect(remove).toHaveBeenCalledWith(SEND_MESSAGE_TO_BRIDGE);
  });

  it('removes the staged value when it matches the stale passphrase', async () => {
    const { remove } = stubBrowser({ [SEND_MESSAGE_TO_BRIDGE]: 'old stale' });

    const result = await clearBridgedPassphrase('old stale');

    expect(result).toBe(true);
    expect(remove).toHaveBeenCalledWith(SEND_MESSAGE_TO_BRIDGE);
  });

  it('keeps a staged value that differs from the stale passphrase (likely the new one)', async () => {
    const { remove } = stubBrowser({
      [SEND_MESSAGE_TO_BRIDGE]: 'new correct',
    });

    const result = await clearBridgedPassphrase('old stale');

    expect(result).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it('is a no-op when nothing is staged', async () => {
    const { remove } = stubBrowser({});

    const result = await clearBridgedPassphrase();

    expect(result).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it('is a no-op outside an extension context (no browser global)', async () => {
    vi.stubGlobal('browser', undefined);

    const result = await clearBridgedPassphrase();

    expect(result).toBe(false);
  });

  it('returns false and does not throw if storage access fails', async () => {
    const get = vi.fn().mockRejectedValue(new Error('storage broken'));
    vi.stubGlobal('browser', { storage: { local: { get } } });

    const result = await clearBridgedPassphrase();

    expect(result).toBe(false);
  });
});
