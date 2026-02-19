import { computed, onMounted, watchEffect } from 'vue';
import { storeToRefs } from 'pinia';

import useBackupStore from '@send-frontend/stores/backup-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';

// move the following imports elsewhere
import { PHRASE_SIZE } from '@send-frontend/apps/common/constants';
import { useExtensionStore } from '@send-frontend/apps/send/stores/extension-store';
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import { useAuth } from '@send-frontend/lib/auth';
import { dbUserSetup } from '@send-frontend/lib/helpers';
import { backupKeys, restoreKeys } from '@send-frontend/lib/keychain';
import { generatePassphrase } from '@send-frontend/lib/passphrase';
import {
  downloadPassPhrase,
  parsePassphrase,
} from '@send-frontend/lib/passphraseUtils';
import { trpc } from '@send-frontend/lib/trpc';
import useApiStore from '@send-frontend/stores/api-store';
import useMetricsStore from '@send-frontend/stores/metrics';
import useUserStore from '@send-frontend/stores/user-store';
import { useMutation, useQuery } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';

/**
 * Composable for managing encryption key backup and restore operations.
 *
 * This handles the complete lifecycle of user encryption keys:
 * - Generating and backing up new keys for first-time users
 * - Restoring keys from backup using a passphrase
 * - Managing passphrase generation and storage
 * - Resetting keys when needed
 *
 * @returns An object containing backup/restore state and methods
 */
export const useBackupAndRestore = () => {
  const router = useRouter();
  const userStore = useUserStore();
  const folderStore = useFolderStore();
  const backupStore = useBackupStore();
  const { words, errorMessage, shouldUnlock, shouldReset, passphraseString } =
    storeToRefs(backupStore);
  const { logOutAuth } = useAuth();
  const { sendMessageToBridge, configureExtension } = useExtensionStore();
  const { api } = useApiStore();
  const {
    getBackup,
    user: { email },
    clearUserFromStorage,
  } = useUserStore();
  const { keychain } = useKeychainStore();
  const { metrics } = useMetricsStore();

  onMounted(() => {
    configureExtension();
    // Initialize words if empty (generate a new passphrase on first load)
    if (words.value.length === 0) {
      backupStore.setWords(generatePassphrase(PHRASE_SIZE));
    }
  });

  /**
   * Query that determines the current backup/restore state:
   * - 'SHOULD_ENCRYPT_AND_BACKUP': First-time user, no backup exists yet
   * - 'SHOULD_RESTORE_FROM_BACKUP': Backup exists but keys not in local storage
   * - 'KEYS_IN_LOCAL_STORAGE': User has keys locally and backup exists
   */
  const {
    isLoading: isLoadingBackup,
    data: backupData,
    refetch,
  } = useQuery({
    queryKey: ['keybackup'],
    queryFn: async () => {
      // 1. We check if the user has previously encrypted and downloaded keys
      const hasBackupInServer = await getBackup();
      if (!hasBackupInServer?.backupKeypair) {
        // No backup found, we need to backup (first time user)
        return 'SHOULD_ENCRYPT_AND_BACKUP';
      } else {
        // 2. We check if the user has keys stored in keychain
        const hasKeysInLocalStorage = keychain.getPassphraseValue();
        if (!hasKeysInLocalStorage) {
          // No keys found, user needs to restore from backup
          return 'SHOULD_RESTORE_FROM_BACKUP';
        }
        return 'KEYS_IN_LOCAL_STORAGE';
      }
    },
    refetchOnMount: true,
    retryOnMount: true,
  });

  /**
   * Mutation to reset all user keys.
   * This will:
   * 1. Delete keys from the server
   * 2. Clear local storage
   * 3. Log out the user
   * 4. Reload the page
   */
  const { mutate: resetKeys } = useMutation({
    mutationKey: ['resetKeys'],
    mutationFn: async () => {
      return await trpc.resetKeys.mutate();
    },
    onSuccess: async () => {
      // We should clear local storage first and then handle logout
      await clearUserFromStorage();
      await logOutAuth();
      window.location.reload();
    },
  });

  /**
   * Regenerates a random passphrase and updates the store with the new words.
   * Used when the user wants a new random passphrase during backup setup.
   */
  const regeneratePassphrase = () => {
    backupStore.setWords(generatePassphrase(PHRASE_SIZE));
  };

  /**
   * Sets a new passphrase and updates the store with the parsed words.
   * Used when restoring from a backup with an existing passphrase.
   *
   * @param newPassphrase - The passphrase string to parse and set
   */
  const setPassphrase = (newPassphrase: string) => {
    const parsedPassphrase = parsePassphrase(newPassphrase);
    backupStore.setWords(parsedPassphrase.split('-'));
  };

  const passphraseFromLocalStorage = keychain.getPassphraseValue();

  /**
   * Computed property that indicates whether the user has encryption keys
   * stored locally in the keychain.
   */
  const keysInLocalStorage = computed(() => {
    return backupData.value === 'KEYS_IN_LOCAL_STORAGE';
  });

  // Watch for when keys are successfully in local storage and mark backup as completed
  watchEffect(() => {
    if (keysInLocalStorage.value) {
      console.log('Backup and restore completed');
      backupStore.setBackupCompleted(true);
    }
  });

  // If there's a passphrase in local storage that differs from the store,
  // sync it to the store (handles page refreshes)
  if (
    !!passphraseFromLocalStorage &&
    passphraseFromLocalStorage !== passphraseString.value
  ) {
    backupStore.setWords(passphraseFromLocalStorage.split(' '));
  }

  /**
   * Creates a backup of the user's encryption keys.
   *
   * This function:
   * 1. Stores the passphrase in the keychain
   * 2. Encrypts and backs up keys to the server
   * 3. Downloads the passphrase as a file for safekeeping
   * 4. Sets up the user's database with the keys
   * 5. Refetches the backup state
   *
   * @throws Will log errors to console if backup fails
   */
  async function makeBackup() {
    backupStore.setErrorMessage('');
    keychain.storePassPhrase(passphraseString.value);

    try {
      await backupKeys(keychain, api, errorMessage);
      sendMessageToBridge(passphraseString.value);
      await downloadPassPhrase(passphraseString.value, email);
      await dbUserSetup(userStore, keychain, folderStore);
    } catch (e) {
      console.error('Error backing up keys', e);
    } finally {
      await refetch();
    }
  }
  /**
   * Restores encryption keys from a server backup using the user's passphrase.
   *
   * This function:
   * 1. Decrypts and restores keys from the server using the passphrase
   * 2. Stores the passphrase in the local keychain
   * 3. Sends the passphrase to the extension bridge for background script access
   * 4. Refetches the backup state
   *
   * @throws Will set error message in store and capture metrics if restore fails
   */
  async function restoreFromBackup() {
    backupStore.setErrorMessage('');
    try {
      await restoreKeys(keychain, api, errorMessage, passphraseString.value);
      keychain.storePassPhrase(passphraseString.value);
      sendMessageToBridge(passphraseString.value);
    } catch (e) {
      metrics.capture('send.restoreKeys.error', {
        message: errorMessage.value,
      });
      backupStore.setErrorMessage(String(e));
    } finally {
      await refetch();
    }
  }

  /**
   * Navigates the user to the security and privacy settings page
   * where they can manage their key backup and restore.
   */
  async function routeToKeyRestore() {
    router.push('/send/security-and-privacy');
  }

  return {
    // State
    isLoadingBackup,
    errorMessage,
    shouldUnlock,
    shouldReset,
    keysInLocalStorage,
    // Human readable backup state for conditional rendering

    backupData,
    // Methods
    regeneratePassphrase,
    setPassphrase,
    makeBackup,
    restoreFromBackup,
    routeToKeyRestore,
    resetKeys,
    // Passphrase
    words,
    passphraseString,
  };
};
