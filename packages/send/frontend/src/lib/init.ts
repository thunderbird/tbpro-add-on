import { INIT_ERRORS } from '@send-frontend/apps/send/const';
import { FolderStore } from '@send-frontend/apps/send/stores/folder-store.types';
import {
  Keychain,
  restoreKeysUsingLocalStorage,
} from '@send-frontend/lib/keychain';
import { useFolderStore } from '@send-frontend/stores';
import useApiStore from '@send-frontend/stores/api-store';
import { UserStoreType as UserStore } from '@send-frontend/stores/user-store';

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

  if (defaultFolderKeyIsMissing) {
    console.warn(
      `Default folder ${defaultFolder.id} exists but has no key. Deleting orphaned container and recreating.`
    );
    await folderStore.deleteFolder(defaultFolder.id);
  }

  if (!defaultFolder || defaultFolderKeyIsMissing) {
    const createFolderResp = await folderStore.createFolder();
    if (!createFolderResp?.id) {
      return INIT_ERRORS.COULD_NOT_CREATE_DEFAULT_FOLDER;
    }
  }

  return INIT_ERRORS.NONE;
}

// Single-flight guard: concurrent callers (e.g. the login flow and dbUserSetup
// firing during the same rapid navigation) share one run instead of each
// independently deciding to delete + recreate the default folder. See issue #930.
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
