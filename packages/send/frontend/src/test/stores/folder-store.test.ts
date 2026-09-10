import useFolderStore, {
  selectDefaultFolder,
  StaleContainerAccessError,
} from '@send-frontend/apps/send/stores/folder-store';
import type { Container } from '@send-frontend/apps/send/stores/folder-store.types';
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

  // --- Locked keychain must not clobber the server key backup ---
  // Regression guard for the cross-client lockout bug: when the passphrase
  // was changed on another client, this client's keychain is locked and a
  // backup here would overwrite the good server backup with one encrypted
  // under the stale passphrase (fresh salt each time), locking out everyone.

  it('does NOT call backupKeys when the keychain is locked', async () => {
    mockCreateContainerSuccess();
    vi.spyOn(
      useKeychainStore().keychain,
      'newKeyForContainer'
    ).mockResolvedValue(undefined);
    vi.spyOn(useKeychainStore().keychain, 'store').mockResolvedValue(undefined);
    useKeychainStore().keychain.locked = true;

    const folderStore = useFolderStore();
    const result = await folderStore.createFolder();

    expect(vi.mocked(backupKeys)).not.toHaveBeenCalled();
    // Folder creation itself still succeeds locally.
    expect(result).toMatchObject({ id: CONTAINER_ID });

    useKeychainStore().keychain.locked = false;
  });

  it('calls backupKeys when the keychain is unlocked', async () => {
    mockCreateContainerSuccess();
    vi.spyOn(
      useKeychainStore().keychain,
      'newKeyForContainer'
    ).mockResolvedValue(undefined);
    vi.spyOn(useKeychainStore().keychain, 'store').mockResolvedValue(undefined);
    useKeychainStore().keychain.locked = false;

    const folderStore = useFolderStore();
    await folderStore.createFolder();

    expect(vi.mocked(backupKeys)).toHaveBeenCalledOnce();
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

// ---------------------------------------------------------------------------
// #1116 — defaultFolder must never route the UI to an orphaned container
// (a root folder whose key is missing from the keychain).
// ---------------------------------------------------------------------------

import { trpc } from '@send-frontend/lib/trpc';

const asContainer = (id: string) => ({ id, name: id }) as Container;

describe('selectDefaultFolder — orphan-aware default folder selection (#1116)', () => {
  const OPENABLE = asContainer('openable-folder');
  const ORPHAN = asContainer('orphan-folder');

  it('prefers the folder whose key exists in the keychain over a newer orphan', () => {
    const result = selectDefaultFolder([OPENABLE, ORPHAN], {
      [OPENABLE.id]: 'wrapped-key',
    });

    expect(result?.id).toBe(OPENABLE.id);
  });

  it('returns the newest folder when multiple folders are openable', () => {
    const result = selectDefaultFolder([OPENABLE, ORPHAN], {
      [OPENABLE.id]: 'wrapped-key-1',
      [ORPHAN.id]: 'wrapped-key-2',
    });

    expect(result?.id).toBe(ORPHAN.id);
  });

  it('falls back to the newest folder when NO folder is openable (init.ts reconciles it)', () => {
    const result = selectDefaultFolder([OPENABLE, ORPHAN], {});

    expect(result?.id).toBe(ORPHAN.id);
  });

  it('returns null for an empty folder list', () => {
    expect(selectDefaultFolder([], {})).toBeNull();
  });
});

describe('FolderStore — defaultFolder routes to a keychain-openable container (#1116)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('picks the openable root container instead of the newest orphan', async () => {
    const openable = asContainer('openable-folder');
    const orphan = asContainer('orphan-folder');
    // `users/folders` response: the orphan is the NEWEST (last) entry.
    vi.spyOn(useApiStore().api, 'call').mockResolvedValue([openable, orphan]);
    // Only the openable container's key is present in the keychain.
    useKeychainStore().keychain.keys = { [openable.id]: 'wrapped-key' };

    const folderStore = useFolderStore();
    await folderStore.sync();

    expect(folderStore.defaultFolder?.id).toBe(openable.id);
  });
});

// ---------------------------------------------------------------------------
// #1115 — phantom cached root container must not crash the folder view and
// must self-recover instead of looping on the dead id.
// ---------------------------------------------------------------------------

describe('FolderStore — fetchSubtree null-guard & phantom-root recovery (#1115)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw and leaves an empty/error state when api.call resolves null', async () => {
    vi.spyOn(useApiStore().api, 'call').mockResolvedValue(null);

    const folderStore = useFolderStore();
    await expect(
      folderStore.fetchSubtree('dead-container')
    ).resolves.not.toThrow();

    expect(folderStore.visibleFolders).toEqual([]);
    expect(folderStore.rootFolder).toBeNull();
  });

  it('clears the cached rootFolderId and falls back to users/folders on a 403 for the cached root', async () => {
    const PHANTOM_ID = 'phantom-container';
    vi.mocked(trpc.getDefaultFolder.query).mockResolvedValue({
      id: PHANTOM_ID,
    } as never);

    const apiCallSpy = vi
      .spyOn(useApiStore().api, 'call')
      .mockImplementation(async (path, _body, _method, _headers, options) => {
        if (typeof path === 'string' && path.startsWith('containers/')) {
          (options as { onFailure?: (f: unknown) => void })?.onFailure?.({
            kind: 'http',
            status: 403,
            statusText: 'Forbidden',
          });
          return null;
        }
        // users/folders fallback
        return [];
      });

    const folderStore = useFolderStore();
    await folderStore.getDefaultFolderId();
    expect(folderStore.rootFolderId).toBe(PHANTOM_ID);

    await folderStore.fetchSubtree(PHANTOM_ID);

    // The dead id is invalidated so sync won't re-request it in a loop.
    expect(folderStore.rootFolderId).toBeNull();
    // It fell back to the user's folder list (re-provisioning path).
    expect(apiCallSpy).toHaveBeenCalledWith(`users/folders`);
    expect(folderStore.rootFolder).toBeNull();
  });

  it('does NOT clear the cached rootFolderId when a non-root subtree fetch 404s', async () => {
    const ROOT_ID = 'real-root';
    vi.mocked(trpc.getDefaultFolder.query).mockResolvedValue({
      id: ROOT_ID,
    } as never);

    const apiCallSpy = vi
      .spyOn(useApiStore().api, 'call')
      .mockImplementation(async (_path, _body, _method, _headers, options) => {
        (options as { onFailure?: (f: unknown) => void })?.onFailure?.({
          kind: 'http',
          status: 404,
          statusText: 'Not Found',
        });
        return null;
      });

    const folderStore = useFolderStore();
    await folderStore.getDefaultFolderId();

    await folderStore.fetchSubtree('some-other-folder');

    expect(folderStore.rootFolderId).toBe(ROOT_ID);
    expect(apiCallSpy).not.toHaveBeenCalledWith(`users/folders`);
  });
});

// ---------------------------------------------------------------------------
// Cross-client passphrase-reset lockout: a 403 on the cached (old) root while
// the keychain is locked must route to recovery, NOT re-provision a new root or
// silently empty the view. This is the case the user hit: stale client B clicks
// the encrypted-files link to its cached `/send/folder/<oldId>`, the server
// returns 403 (container still exists, B just lost read access), and B was left
// on a dead view because the #1115 recovery is gated on `rootFolderId===folderId`
// (false for B, whose rootFolderId already refreshed to the new root).
// ---------------------------------------------------------------------------

describe('FolderStore — 403 on a cached container while locked (cross-client lockout)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    useKeychainStore().keychain.locked = false;
    vi.restoreAllMocks();
  });

  it('throws StaleContainerAccessError on a 403 when the keychain is locked (even if rootFolderId != folderId)', async () => {
    const NEW_ROOT = 'new-root-after-reset';
    const OLD_CACHED = 'old-cached-root-in-memory';
    // rootFolderId has already refreshed to the NEW root, so the #1115 guard
    // (rootFolderId === folderId) would NOT match the old cached id.
    vi.mocked(trpc.getDefaultFolder.query).mockResolvedValue({
      id: NEW_ROOT,
    } as never);

    const apiCallSpy = vi
      .spyOn(useApiStore().api, 'call')
      .mockImplementation(async (path, _body, _method, _headers, options) => {
        if (typeof path === 'string' && path.startsWith('containers/')) {
          (options as { onFailure?: (f: unknown) => void })?.onFailure?.({
            kind: 'http',
            status: 403,
            statusText: 'Forbidden',
          });
          return null;
        }
        return [];
      });

    const folderStore = useFolderStore();
    await folderStore.getDefaultFolderId();
    expect(folderStore.rootFolderId).toBe(NEW_ROOT);

    useKeychainStore().keychain.locked = true;

    await expect(folderStore.fetchSubtree(OLD_CACHED)).rejects.toBeInstanceOf(
      StaleContainerAccessError
    );
    // Must NOT fall back to re-provisioning via users/folders.
    expect(apiCallSpy).not.toHaveBeenCalledWith(`users/folders`);
  });

  it('still re-provisions (no throw) on a 403 for the cached root when the keychain is UNLOCKED (genuine phantom, #1115)', async () => {
    const PHANTOM_ID = 'phantom-root';
    vi.mocked(trpc.getDefaultFolder.query).mockResolvedValue({
      id: PHANTOM_ID,
    } as never);

    const apiCallSpy = vi
      .spyOn(useApiStore().api, 'call')
      .mockImplementation(async (path, _body, _method, _headers, options) => {
        if (typeof path === 'string' && path.startsWith('containers/')) {
          (options as { onFailure?: (f: unknown) => void })?.onFailure?.({
            kind: 'http',
            status: 403,
            statusText: 'Forbidden',
          });
          return null;
        }
        return [];
      });

    const folderStore = useFolderStore();
    await folderStore.getDefaultFolderId();
    useKeychainStore().keychain.locked = false;

    // Unlocked: the lockout throw is skipped; the #1115 phantom recovery runs.
    await expect(folderStore.fetchSubtree(PHANTOM_ID)).resolves.toBeUndefined();
    expect(folderStore.rootFolderId).toBeNull();
    expect(apiCallSpy).toHaveBeenCalledWith(`users/folders`);
  });
});
