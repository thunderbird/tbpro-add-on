import { INIT_ERRORS } from '@send-frontend/apps/send/const';
import init from '@send-frontend/lib/init';
import { restoreKeysUsingLocalStorage } from '@send-frontend/lib/keychain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// init() pulls the api connection from the store and attempts a key restore
// before deciding a default folder is orphaned. Mock both so the tests can
// control whether the restore populates the keychain.
vi.mock('@send-frontend/stores/api-store', () => ({
  default: () => ({ api: {} }),
}));

vi.mock('@send-frontend/lib/keychain', () => ({
  restoreKeysUsingLocalStorage: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helper factories — produce minimal duck-typed stand-ins for each dependency
// ---------------------------------------------------------------------------

function makeUserStore({ hasUser = true } = {}) {
  return {
    loadFromLocalStorage: vi.fn().mockResolvedValue(hasUser),
  };
}

/**
 * Build a minimal Keychain stand-in.
 * @param keysMap - Pre-seeded key map ({ [containerId]: 'wrapped-key' })
 * @param hasKeychain - What `keychain.load()` resolves to
 */
function makeKeychain(
  keysMap: Record<string, string> = {},
  { hasKeychain = true, locked = false } = {}
) {
  return {
    load: vi.fn().mockResolvedValue(hasKeychain),
    locked,
    get keys() {
      return keysMap;
    },
  };
}

function makeFolderStore({
  defaultFolder = null as { id: string } | null,
  createFolderResult = { id: 'new-folder-id' } as { id: string } | null,
} = {}) {
  // `defaultFolder` is a getter so that tests can observe state changes after
  // `deleteFolder` is called (mirroring how the real store reacts).
  let _defaultFolder = defaultFolder;
  return {
    sync: vi.fn().mockImplementation(async () => {}),
    get defaultFolder() {
      return _defaultFolder;
    },
    createFolder: vi.fn().mockResolvedValue(createFolderResult),
    deleteFolder: vi.fn().mockImplementation(async () => {
      _defaultFolder = null;
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('init()', () => {
  // Re-create fresh mocks for every test to avoid cross-test state leakage
  let userStore: ReturnType<typeof makeUserStore>;
  let keychain: ReturnType<typeof makeKeychain>;
  let folderStore: ReturnType<typeof makeFolderStore>;

  beforeEach(() => {
    userStore = makeUserStore();
    keychain = makeKeychain();
    folderStore = makeFolderStore();
    vi.mocked(restoreKeysUsingLocalStorage).mockReset();
  });

  // --- Early-exit error paths (pre-existing behaviour — regression tests) ---

  it('returns NO_USER when user cannot be loaded from storage', async () => {
    userStore = makeUserStore({ hasUser: false });

    const result = await init(
      userStore as any,
      keychain as any,
      folderStore as any
    );

    expect(result).toBe(INIT_ERRORS.NO_USER);
    // Must not proceed to folder operations
    expect(folderStore.sync).not.toHaveBeenCalled();
  });

  it('returns NO_KEYCHAIN when keychain cannot be loaded', async () => {
    keychain = makeKeychain({}, { hasKeychain: false });

    const result = await init(
      userStore as any,
      keychain as any,
      folderStore as any
    );

    expect(result).toBe(INIT_ERRORS.NO_KEYCHAIN);
    expect(folderStore.sync).not.toHaveBeenCalled();
  });

  // --- Happy path: no existing default folder ---

  it('creates a default folder when none exists and returns NONE', async () => {
    folderStore = makeFolderStore({ defaultFolder: null });

    const result = await init(
      userStore as any,
      keychain as any,
      folderStore as any
    );

    expect(folderStore.sync).toHaveBeenCalledOnce();
    expect(folderStore.createFolder).toHaveBeenCalledOnce();
    expect(result).toBe(INIT_ERRORS.NONE);
  });

  it('returns COULD_NOT_CREATE_DEFAULT_FOLDER when createFolder returns null', async () => {
    folderStore = makeFolderStore({
      defaultFolder: null,
      createFolderResult: null,
    });

    const result = await init(
      userStore as any,
      keychain as any,
      folderStore as any
    );

    expect(result).toBe(INIT_ERRORS.COULD_NOT_CREATE_DEFAULT_FOLDER);
  });

  it('returns COULD_NOT_CREATE_DEFAULT_FOLDER when createFolder returns an object without id', async () => {
    folderStore = makeFolderStore({
      defaultFolder: null,
      createFolderResult: {} as any,
    });

    const result = await init(
      userStore as any,
      keychain as any,
      folderStore as any
    );

    expect(result).toBe(INIT_ERRORS.COULD_NOT_CREATE_DEFAULT_FOLDER);
  });

  // --- Happy path: default folder exists with a valid key ---

  it('skips folder creation when default folder has a key in the keychain', async () => {
    const folderId = 'folder-abc123';
    folderStore = makeFolderStore({ defaultFolder: { id: folderId } });
    keychain = makeKeychain({ [folderId]: 'wrapped-key-string' });

    const result = await init(
      userStore as any,
      keychain as any,
      folderStore as any
    );

    expect(folderStore.deleteFolder).not.toHaveBeenCalled();
    expect(folderStore.createFolder).not.toHaveBeenCalled();
    expect(result).toBe(INIT_ERRORS.NONE);
  });

  // --- New behaviour: orphaned container detection ---

  it('deletes orphaned container and creates a new folder when key is missing', async () => {
    const orphanId = 'orphaned-container-id';
    folderStore = makeFolderStore({
      defaultFolder: { id: orphanId },
      createFolderResult: { id: 'fresh-folder-id' },
    });
    // No key for the orphan in the keychain
    keychain = makeKeychain({});

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await init(
      userStore as any,
      keychain as any,
      folderStore as any
    );

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(orphanId));
    expect(folderStore.deleteFolder).toHaveBeenCalledWith(orphanId);
    expect(folderStore.createFolder).toHaveBeenCalledOnce();
    expect(result).toBe(INIT_ERRORS.NONE);

    consoleSpy.mockRestore();
  });

  // --- Cross-client passphrase-reset lockout (the bug reproduced on staging) ---
  //
  // When the passphrase was changed on another client, this client's keychain is
  // LOCKED: the default folder's key exists on the server but can't be unwrapped
  // locally, so `keychain.keys[defaultFolder.id]` is empty. That is a DECRYPTION
  // failure, not an orphaned container. init() must never delete + recreate the
  // real container in this state (doing so creates a fresh root with stale keys
  // that client A doesn't know about).

  it('does NOT delete or recreate the default folder when the keychain is locked and its key is missing', async () => {
    const folderId = 'good-container-locked-out';
    folderStore = makeFolderStore({ defaultFolder: { id: folderId } });
    // Locked keychain, and the key never made it into local storage (stale passphrase).
    keychain = makeKeychain({}, { locked: true });

    const result = await init(
      userStore as any,
      keychain as any,
      folderStore as any
    );

    // The real, server-side-valid container must survive untouched.
    expect(folderStore.deleteFolder).not.toHaveBeenCalled();
    expect(folderStore.createFolder).not.toHaveBeenCalled();
    expect(result).toBe(INIT_ERRORS.KEYCHAIN_LOCKED);
  });

  it('does NOT create a default folder when the keychain is locked and none is resolved locally', async () => {
    // No default folder visible locally (can't decrypt any), but keychain is locked:
    // creating a fresh root here would fork the account away from the server state.
    folderStore = makeFolderStore({ defaultFolder: null });
    keychain = makeKeychain({}, { locked: true });

    const result = await init(
      userStore as any,
      keychain as any,
      folderStore as any
    );

    expect(folderStore.createFolder).not.toHaveBeenCalled();
    expect(folderStore.deleteFolder).not.toHaveBeenCalled();
    expect(result).toBe(INIT_ERRORS.KEYCHAIN_LOCKED);
  });

  it('still deletes + recreates a genuinely orphaned container when the keychain is UNLOCKED', async () => {
    // Regression guard: the lock check must not weaken the real orphan-cleanup path.
    const orphanId = 'genuinely-orphaned';
    folderStore = makeFolderStore({
      defaultFolder: { id: orphanId },
      createFolderResult: { id: 'fresh-folder-id' },
    });
    keychain = makeKeychain({}, { locked: false });

    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await init(
      userStore as any,
      keychain as any,
      folderStore as any
    );

    expect(folderStore.deleteFolder).toHaveBeenCalledWith(orphanId);
    expect(folderStore.createFolder).toHaveBeenCalledOnce();
    expect(result).toBe(INIT_ERRORS.NONE);

    vi.restoreAllMocks();
  });

  it('returns COULD_NOT_CREATE_DEFAULT_FOLDER when recreation fails after orphan deletion', async () => {
    const orphanId = 'orphaned-container-id';
    folderStore = makeFolderStore({
      defaultFolder: { id: orphanId },
      createFolderResult: null,
    });
    keychain = makeKeychain({});

    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await init(
      userStore as any,
      keychain as any,
      folderStore as any
    );

    expect(folderStore.deleteFolder).toHaveBeenCalledWith(orphanId);
    expect(folderStore.createFolder).toHaveBeenCalledOnce();
    expect(result).toBe(INIT_ERRORS.COULD_NOT_CREATE_DEFAULT_FOLDER);

    vi.restoreAllMocks();
  });

  // --- Regression for #930: do not destroy a valid container ---

  it('restores keys before the orphan check and does NOT delete when the key arrives via restore', async () => {
    const folderId = 'folder-from-backup';
    const keysMap: Record<string, string> = {}; // key not in local storage yet
    folderStore = makeFolderStore({ defaultFolder: { id: folderId } });
    keychain = makeKeychain(keysMap);

    // The server-backup restore populates the previously-missing key.
    vi.mocked(restoreKeysUsingLocalStorage).mockImplementation(async () => {
      keysMap[folderId] = 'restored-key';
    });

    const result = await init(
      userStore as any,
      keychain as any,
      folderStore as any
    );

    expect(restoreKeysUsingLocalStorage).toHaveBeenCalledOnce();
    // The valid container must survive: no destructive delete + recreate.
    expect(folderStore.deleteFolder).not.toHaveBeenCalled();
    expect(folderStore.createFolder).not.toHaveBeenCalled();
    expect(result).toBe(INIT_ERRORS.NONE);
  });

  it('is single-flight: concurrent calls share one run (no double delete/create)', async () => {
    folderStore = makeFolderStore({ defaultFolder: null });

    const [r1, r2] = await Promise.all([
      init(userStore as any, keychain as any, folderStore as any),
      init(userStore as any, keychain as any, folderStore as any),
    ]);

    // Both callers resolve, but the work runs exactly once.
    expect(folderStore.sync).toHaveBeenCalledOnce();
    expect(folderStore.createFolder).toHaveBeenCalledOnce();
    expect(r1).toBe(INIT_ERRORS.NONE);
    expect(r2).toBe(INIT_ERRORS.NONE);
  });
});
