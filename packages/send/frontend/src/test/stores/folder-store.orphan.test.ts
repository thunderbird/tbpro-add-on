import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Regression test for issue #1116 (orphaned root container reconciliation).
//
// Provisioning can leave TWO root containers for an account: one whose key
// landed in the keychain, and an orphan whose key never did. The old
// `defaultFolder` getter blindly returned the LAST folder in the list, so it
// could route the UI to the orphan. Every upload into the orphan then failed
// client-side with "You don't have the key to decrypt this container" before
// any network call, with no way to reach the working container.
//
// The fix makes `defaultFolder` prefer a root container whose key the keychain
// can actually open, and only fall back to the newest-overall folder when NONE
// are openable (e.g. keys not yet restored).
// ---------------------------------------------------------------------------

vi.mock('@send-frontend/lib/keychain', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@send-frontend/lib/keychain')>();
  return {
    ...original,
    backupKeys: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@send-frontend/lib/trpc', () => ({
  trpc: {
    getDefaultFolder: { query: vi.fn().mockResolvedValue({ id: null }) },
  },
}));

vi.mock('@send-frontend/lib/upload', () => ({
  default: vi.fn(function () {}),
}));
vi.mock('@send-frontend/lib/download', () => ({
  default: vi.fn(function () {}),
}));

const ORPHAN = { id: 'orphan-471b08b9', name: 'Default' };
const KEYED = { id: 'keyed-ac3e124f', name: 'Default' };

/**
 * Seed the folder store's internal `folders` ref via the public `sync()` path.
 * `sync()` calls `api.call('users/folders')`, which we stub.
 */
async function seedFolders(
  folderStore: ReturnType<typeof useFolderStore>,
  folders: { id: string; name: string }[]
) {
  const useApiStore = (await import('@send-frontend/stores/api-store')).default;
  vi.spyOn(useApiStore().api, 'call').mockResolvedValue(folders);
  await folderStore.sync();
}

/** Put a (dummy) wrapped key for `id` into the keychain so keys[id] is truthy. */
function giveKeychainKeyFor(id: string) {
  const { keychain } = useKeychainStore();
  keychain.keys = { ...keychain.keys, [id]: 'wrapped-key-material' };
}

describe('FolderStore — defaultFolder orphan reconciliation (#1116)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes to the container the keychain can open, even when the orphan is last in the list', async () => {
    const folderStore = useFolderStore();
    // The keyed container is FIRST; the orphan is LAST (the old getter would
    // have picked the orphan).
    await seedFolders(folderStore, [KEYED, ORPHAN]);
    giveKeychainKeyFor(KEYED.id);

    expect(folderStore.defaultFolder?.id).toBe(KEYED.id);
  });

  it('does not route to an orphan whose key is missing from the keychain', async () => {
    const folderStore = useFolderStore();
    await seedFolders(folderStore, [KEYED, ORPHAN]);
    giveKeychainKeyFor(KEYED.id);

    expect(folderStore.defaultFolder?.id).not.toBe(ORPHAN.id);
  });

  it('prefers the most recent openable container when several are openable', async () => {
    const older = { id: 'older-openable', name: 'Default' };
    const newer = { id: 'newer-openable', name: 'Default' };
    const folderStore = useFolderStore();
    // Order is creation-ascending; the newest openable is last among openables.
    await seedFolders(folderStore, [older, newer]);
    giveKeychainKeyFor(older.id);
    giveKeychainKeyFor(newer.id);

    expect(folderStore.defaultFolder?.id).toBe(newer.id);
  });

  it('falls back to the newest-overall folder when NO container is openable (keys not yet restored)', async () => {
    const folderStore = useFolderStore();
    await seedFolders(folderStore, [KEYED, ORPHAN]);
    // Intentionally give the keychain NO keys.

    expect(folderStore.defaultFolder?.id).toBe(ORPHAN.id);
  });

  it('returns null when there are no folders', async () => {
    const folderStore = useFolderStore();
    await seedFolders(folderStore, []);

    expect(folderStore.defaultFolder).toBeNull();
  });
});
