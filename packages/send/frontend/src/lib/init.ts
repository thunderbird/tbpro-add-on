import { INIT_ERRORS } from '@send-frontend/apps/send/const';
import { FolderStore } from '@send-frontend/apps/send/stores/folder-store.types';
import {
  Keychain,
  restoreKeysUsingLocalStorage,
} from '@send-frontend/lib/keychain';
import { useFolderStore } from '@send-frontend/stores';
import useApiStore from '@send-frontend/stores/api-store';
import { UserStoreType as UserStore } from '@send-frontend/stores/user-store';
import {
  acquireDefaultFolderLock,
  releaseDefaultFolderLock,
} from '@send-frontend/lib/initFolderLock';

/**
 * Loads user and keychain from storage; creates default folder if necessary.
 * @param {UserStore} userStore - Pinia store for managing user.
 * @param {Keychain} keychain - Instance of Keychain class.
 * @param {FolderStore} folderStore - Pinia store for managing folders.
 * @return {Promise<INIT_ERRORS>} - Returns Promise of 0 (success) or an error code typed by INIT_ERRORS.
 */
async function _init(
  userStore: UserStore,
  keychain: Keychain,
  folderStore: FolderStore | ReturnType<typeof useFolderStore>
): Promise<INIT_ERRORS> {
  const hasUser = await userStore.loadFromLocalStorage();
  const hasKeychain = await keychain.load();

  if (!hasUser) {
    return INIT_ERRORS.NO_USER;
  }

  if (!hasKeychain) {
    return INIT_ERRORS.NO_KEYCHAIN;
  }

  // Ensure container keys are restored from the server backup before deciding a
  // default folder is "orphaned". keychain.load() above only reads local storage;
  // a valid folder's key may live only in the server backup and would otherwise
  // appear missing here, causing us to destroy a perfectly good container.
  // This is idempotent and no-ops when no passphrase is available.
  try {
    const { api } = useApiStore();
    await restoreKeysUsingLocalStorage(keychain, api);
  } catch (error) {
    console.warn('init(): could not restore keys before folder check', error);
  }

  await folderStore.sync();
  const defaultFolder = folderStore?.defaultFolder;
  const defaultFolderKeyIsMissing =
    defaultFolder && !keychain.keys[defaultFolder.id];

  if (!defaultFolder || defaultFolderKeyIsMissing) {
    // The delete+recreate branch below is the one that must never run twice
    // concurrently for the same account (see #930, #1032): background, popup,
    // and any web-app tab each hold their own JS module instance of this file,
    // so the in-process `inFlight` guard in init() below only protects against
    // duplicate runs WITHIN one of those contexts, not across them. This
    // storage-backed lock is the cross-context equivalent -- it's a no-op (and
    // this whole branch just proceeds unguarded) in any context where
    // `browser.storage.local` isn't available, since only extension contexts
    // can race each other this way; a lone web-app tab has no sibling context
    // to race against.
    const lockToken = await acquireDefaultFolderLock(userStore.user?.id);

    if (lockToken === null) {
      // Another context currently holds the lock and is already deciding
      // whether to delete + recreate this exact account's default folder.
      // Don't pile on: re-sync and trust whatever that other context leaves
      // behind rather than racing it. If it fails partway (e.g. the tab
      // closes), the lock's short TTL lets the next init() attempt through.
      await folderStore.sync();
      return folderStore?.defaultFolder ? INIT_ERRORS.NONE : INIT_ERRORS.NO_KEYCHAIN;
    }

    try {
      if (defaultFolderKeyIsMissing) {
        console.warn(
          `Default folder ${defaultFolder.id} exists but has no key. Deleting orphaned container and recreating.`
        );
        await folderStore.deleteFolder(defaultFolder.id);
      }

      const createFolderResp = await folderStore.createFolder();
      if (!createFolderResp?.id) {
        return INIT_ERRORS.COULD_NOT_CREATE_DEFAULT_FOLDER;
      }
    } finally {
      await releaseDefaultFolderLock(userStore.user?.id, lockToken);
    }
  }

  return INIT_ERRORS.NONE;
}

// Single-flight guard: concurrent callers WITHIN THE SAME CONTEXT (e.g. the
// login flow and dbUserSetup firing during the same rapid navigation) share
// one run instead of each independently deciding to delete + recreate the
// default folder. See issue #930.
//
// This only helps callers sharing this exact module instance. It does NOT
// coordinate across background/popup/web-tab contexts, each of which loads
// its own independent copy of this module -- that's what the storage-backed
// lock inside _init() above is for. See issue #1032.
let inFlight: Promise<INIT_ERRORS> | null = null;

function init(
  userStore: UserStore,
  keychain: Keychain,
  folderStore: FolderStore | ReturnType<typeof useFolderStore>
): Promise<INIT_ERRORS> {
  if (inFlight) {
    return inFlight;
  }
  inFlight = _init(userStore, keychain, folderStore).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export default init;
