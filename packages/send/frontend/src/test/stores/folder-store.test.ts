import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import useApiStore from '@send-frontend/stores/api-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

// Mock `backupKeys` in-place, but preserve `Keychain` (used for types/instances
// in the store) by spreading the original module.
vi.mock('@send-frontend/lib/keychain', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@send-frontend/lib/keychain')>();
  return {
    ...original,
    backupKeys: vi.fn().mockResolvedValue(undefined),
  };
});

// Prevent real tRPC calls that fire in `onMounted`.
vi.mock('@send-frontend/lib/trpc', () => ({
  trpc: {
    getDefaultFolder: { query: vi.fn().mockResolvedValue({ id: null }) },
  },
}));

// Stub heavy classes that are irrelevant to createFolder().
// Regular (non-arrow) functions must be used so they can be called with `new`.
vi.mock('@send-frontend/lib/upload', () => ({
  default: vi.fn(function () {}),
}));
vi.mock('@send-frontend/lib/download', () => ({
  default: vi.fn(function () {}),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { backupKeys } from '@send-frontend/lib/keychain';

const CONTAINER_ID = 'container-abc';
const DEFAULT_CONTAINER = { id: CONTAINER_ID, name: 'Default' };

/** Set up the api.call spy. First call returns a successful POST response. */
function mockCreateContainerSuccess() {
  return vi
    .spyOn(useApiStore().api, 'call')
    .mockResolvedValue({ container: DEFAULT_CONTAINER });
}

function mockCreateContainerThenDelete() {
  return vi
    .spyOn(useApiStore().api, 'call')
    .mockResolvedValueOnce({ container: DEFAULT_CONTAINER }) // POST containers
    .mockResolvedValueOnce(undefined); // DELETE containers/:id
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FolderStore — createFolder()', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    // Clear call history accumulated by module-level mocks across tests.
    vi.clearAllMocks();
    // Suppress expected console.error output so test output stays clean.
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.restoreAllMocks();
  });

  // --- Happy path ---

  it('returns the created container when key setup succeeds', async () => {
    mockCreateContainerSuccess();
    vi.spyOn(
      useKeychainStore().keychain,
      'newKeyForContainer'
    ).mockResolvedValue(undefined);
    vi.spyOn(useKeychainStore().keychain, 'store').mockResolvedValue(undefined);

    const folderStore = useFolderStore();
    const result = await folderStore.createFolder();

    expect(result).toMatchObject({ id: CONTAINER_ID });
  });

  it('stores keys and backs them up when key setup succeeds', async () => {
    mockCreateContainerSuccess();
    const newKeySpy = vi
      .spyOn(useKeychainStore().keychain, 'newKeyForContainer')
      .mockResolvedValue(undefined);
    const storeSpy = vi
      .spyOn(useKeychainStore().keychain, 'store')
      .mockResolvedValue(undefined);

    const folderStore = useFolderStore();
    await folderStore.createFolder();

    expect(newKeySpy).toHaveBeenCalledWith(CONTAINER_ID);
    expect(vi.mocked(backupKeys)).toHaveBeenCalledOnce();
    expect(storeSpy).toHaveBeenCalledOnce();
  });

  it('adds the container to the store so defaultFolder is non-null after success', async () => {
    mockCreateContainerSuccess();
    vi.spyOn(
      useKeychainStore().keychain,
      'newKeyForContainer'
    ).mockResolvedValue(undefined);
    vi.spyOn(useKeychainStore().keychain, 'store').mockResolvedValue(undefined);

    const folderStore = useFolderStore();
    await folderStore.createFolder();

    expect(folderStore.defaultFolder).not.toBeNull();
    expect(folderStore.defaultFolder?.id).toBe(CONTAINER_ID);
  });

  // --- Rollback on key-setup failure ---

  it('returns null when newKeyForContainer throws', async () => {
    mockCreateContainerThenDelete();
    vi.spyOn(
      useKeychainStore().keychain,
      'newKeyForContainer'
    ).mockRejectedValue(new Error('WebCrypto failure'));

    const folderStore = useFolderStore();
    const result = await folderStore.createFolder();

    expect(result).toBeNull();
  });

  it('issues a DELETE to roll back the orphaned container when newKeyForContainer throws', async () => {
    const apiCallSpy = mockCreateContainerThenDelete();
    vi.spyOn(
      useKeychainStore().keychain,
      'newKeyForContainer'
    ).mockRejectedValue(new Error('Key error'));

    const folderStore = useFolderStore();
    await folderStore.createFolder();

    expect(apiCallSpy).toHaveBeenCalledWith(
      `containers/${CONTAINER_ID}`,
      {},
      'DELETE'
    );
  });

  it('does NOT add the container to the store state when key setup fails', async () => {
    mockCreateContainerThenDelete();
    vi.spyOn(
      useKeychainStore().keychain,
      'newKeyForContainer'
    ).mockRejectedValue(new Error('crypto failure'));

    const folderStore = useFolderStore();
    await folderStore.createFolder();

    expect(folderStore.defaultFolder).toBeNull();
  });

  it('logs an error when rolling back after a key-setup failure', async () => {
    mockCreateContainerThenDelete();
    vi.spyOn(
      useKeychainStore().keychain,
      'newKeyForContainer'
    ).mockRejectedValue(new Error('Key error'));

    const folderStore = useFolderStore();
    await folderStore.createFolder();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(CONTAINER_ID),
      expect.any(Error)
    );
  });

  // --- Double failure: rollback also fails ---

  it('still returns null when both key setup and the DELETE rollback fail', async () => {
    vi.spyOn(useApiStore().api, 'call')
      .mockResolvedValueOnce({ container: DEFAULT_CONTAINER }) // POST
      .mockRejectedValueOnce(new Error('Network error')); // DELETE
    vi.spyOn(
      useKeychainStore().keychain,
      'newKeyForContainer'
    ).mockRejectedValue(new Error('Key error'));

    const folderStore = useFolderStore();
    const result = await folderStore.createFolder();

    expect(result).toBeNull();
  });

  it('logs two errors when both key setup and the DELETE rollback fail', async () => {
    vi.spyOn(useApiStore().api, 'call')
      .mockResolvedValueOnce({ container: DEFAULT_CONTAINER })
      .mockRejectedValueOnce(new Error('Network error'));
    vi.spyOn(
      useKeychainStore().keychain,
      'newKeyForContainer'
    ).mockRejectedValue(new Error('Key error'));

    const folderStore = useFolderStore();
    await folderStore.createFolder();

    expect(consoleSpy).toHaveBeenCalledTimes(2);
  });

  // --- No container in response ---

  it('returns null and makes no key operations when the backend returns no container', async () => {
    vi.spyOn(useApiStore().api, 'call').mockResolvedValue({});
    const newKeySpy = vi.spyOn(
      useKeychainStore().keychain,
      'newKeyForContainer'
    );

    const folderStore = useFolderStore();
    const result = await folderStore.createFolder();

    expect(result).toBeNull();
    expect(newKeySpy).not.toHaveBeenCalled();
  });
});
