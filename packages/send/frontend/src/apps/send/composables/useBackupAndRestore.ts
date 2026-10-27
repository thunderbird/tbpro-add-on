import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue';
import { storeToRefs } from 'pinia';

import { ANALYTICS_EVENTS } from '@send-frontend/lib/analytics/events';
import useBackupStore from '@send-frontend/stores/backup-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';

// move the following imports elsewhere
import { PHRASE_SIZE } from '@send-frontend/apps/common/constants';
import { useExtensionStore } from '@send-frontend/apps/send/stores/extension-store';
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import { dbUserSetup } from '@send-frontend/lib/helpers';
import {
  backupKeys,
  generateResetKeyBlob,
  restoreKeys,
  type JwkKeyPair,
} from '@send-frontend/lib/keychain';
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
  const {
    words,
    errorMessage,
    shouldUnlock,
    shouldReset,
    justReset,
    pendingReset,
    savingBackup,
    passphraseString,
  } = storeToRefs(backupStore);
  const { sendMessageToBridge, configureExtension } = useExtensionStore();
  const { api } = useApiStore();
  const {
    getBackup,
    user: { email },
  } = useUserStore();
  const { keychain } = useKeychainStore();
  const { metrics } = useMetricsStore();

  let unmounted = false;
  onUnmounted(() => {
    unmounted = true;
  });

  onMounted(() => {
    // The reset overlay replaces a (possibly locked) key; don't bounce it.
    if (keychain.locked && !justReset.value) {
      router.push('/passphrase-changed');
      return;
    }
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
      if (hasBackupInServer === null) {
        return 'AUTH_ERROR';
      }

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
   * Opens the Reset Encryption Key modal with a fresh passphrase. The server
   * keeps the old key until "Download key and reset" (confirmReset), so
   * cancelling or leaving before that click changes nothing (#1355).
   */
  function beginReset() {
    // A swapped-in key still waiting to be saved must stay on screen.
    if (justReset.value || savingBackup.value) return;
    backupStore.setWords(generatePassphrase(PHRASE_SIZE));
    backupStore.setPendingReset(true);
    backupStore.setErrorMessage('');
    backupStore.setShouldReset(true);
  }

  /** Cancel or leaving the page before the swap keeps the old key. */
  function cancelReset() {
    if (!pendingReset.value || savingBackup.value) return;
    backupStore.setPendingReset(false);
    backupStore.setShouldReset(false);
    backupStore.setErrorMessage('');
  }

  /**
   * "Download key and reset": swaps the key in, saves and downloads it, then
   * goes to the dashboard. A rejected swap keeps the modal up with the old key.
   * If the swap went through but saving failed, the forced BackupKeys overlay
   * (justReset) takes over so the installed phrase can't be lost.
   */
  async function confirmReset() {
    if (!pendingReset.value || savingBackup.value) return;
    const saved = await makeBackup();
    if (!saved && pendingReset.value) {
      // Rejected after the user left: the unmount's cancelReset was skipped
      // while saving, so drop the reset now instead of reopening it later.
      if (unmounted) cancelReset();
      return;
    }
    if (!saved) backupStore.setJustReset(true);
    backupStore.setShouldReset(false);
    router.push('/send/profile?showDashboard=true');
  }

  /**
   * Swaps the pending reset key in on the server (write-new-then-swap, #1116),
   * then adopts it locally. Returns false when the key could not be adopted.
   */
  async function swapInResetKey(passphrase: string): Promise<boolean> {
    let keypair: JwkKeyPair;
    try {
      const material = await generateResetKeyBlob(passphrase);
      await trpc.resetKeys.mutate(material.blob);
      keypair = material.keypair;
    } catch (e) {
      // Nothing local changed: the old key still works everywhere.
      backupStore.setErrorMessage(
        `Could not reset your encryption key: ${String(e)}`
      );
      return false;
    }
    backupStore.setPendingReset(false);
    try {
      await keychain.rsa.setPrivateKeyFromJwk(keypair.privateKey);
      await keychain.rsa.setPublicKeyFromJwk(keypair.publicKey);
      keychain.keys = {};
      keychain.locked = false;
      await keychain.storePassPhrase(passphrase);
      await keychain.store();
      return true;
    } catch (e) {
      backupStore.setErrorMessage(
        `Your encryption key was reset, but it could not be saved on this ` +
          `device (${String(e)}). Write down the recovery phrase shown and ` +
          `use it to restore access.`
      );
      return false;
    }
  }

  /**
   * Mutation to delete all of the user's Send files from the server.
   * On success, `filesDeleted` flips to true so the page can show a
   * confirmation screen; returning to the dashboard from there does the
   * hard reload that recreates a default folder. `deleteFailed` lets the
   * page surface an error instead of leaving the user without feedback.
   */
  const {
    mutate: deleteFiles,
    isSuccess: filesDeleted,
    isError: deleteFailed,
    reset: resetDeleteFiles,
  } = useMutation({
    mutationKey: ['deleteFiles'],
    mutationFn: async () => {
      return await trpc.deleteFiles.mutate();
    },
  });

  // Locked while saving and once the reset key is on the server: the phrase
  // shown must stay the one that opens the server backup (#1355).
  const canRegenerate = computed(
    () => !savingBackup.value && !(justReset.value && !pendingReset.value)
  );

  /**
   * Regenerates a random passphrase and updates the store with the new words.
   * Used when the user wants a new random passphrase during backup setup.
   */
  const regeneratePassphrase = () => {
    if (!canRegenerate.value) return;
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
  // sync it to the store (handles page refreshes). Not during a reset: `words`
  // holds the new phrase, local storage may hold the old (#1355).
  if (
    !justReset.value &&
    !pendingReset.value &&
    !!passphraseFromLocalStorage &&
    passphraseFromLocalStorage !== passphraseString.value
  ) {
    backupStore.setWords(passphraseFromLocalStorage.split(' '));
  }

  /**
   * Creates a backup of the user's encryption keys ("Download and Continue").
   *
   * This function:
   * 1. Swaps in the new key first when a reset is pending (swapInResetKey)
   * 2. Stores the passphrase in the keychain
   * 3. Encrypts and backs up keys to the server
   * 4. Downloads the passphrase as a file for safekeeping
   * 5. Sets up the user's database with the keys
   * 6. Refetches the backup state
   *
   * Resolves true once saved; on failure the phrase stays up with an error.
   */
  async function makeBackup(): Promise<boolean> {
    if (savingBackup.value) return false;
    backupStore.setSavingBackup(true);
    backupStore.setErrorMessage('');
    const passphrase = passphraseString.value;
    try {
      if (pendingReset.value && !(await swapInResetKey(passphrase))) {
        return false;
      }
      return await saveBackup(passphrase);
    } finally {
      backupStore.setSavingBackup(false);
    }
  }

  async function saveBackup(passphrase: string): Promise<boolean> {
    try {
      // Awaited: backupKeys encrypts with the stored phrase, not `passphrase`.
      await keychain.storePassPhrase(passphrase);
      // Scratch status ref: backupKeys writes "✅ Backup complete" into it,
      // which must not show up as the overlay's error.
      await backupKeys(keychain, api, ref(''));
      sendMessageToBridge(passphrase);
      await downloadPassPhrase(passphrase, email);
      await dbUserSetup(userStore, keychain, folderStore);
      // The user has now saved their (possibly post-reset) recovery key, so the
      // forced overlay can stand down (issue #1116).
      backupStore.setJustReset(false);
      return true;
    } catch (e) {
      console.error('Error backing up keys', e);
      backupStore.setErrorMessage(
        `Could not finish saving your recovery key (${String(e)}). ` +
          `Keep the phrase shown and try again.`
      );
      return false;
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
      metrics.capture(ANALYTICS_EVENTS.KEYS_RESTORE_FAILED, {
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
    justReset,
    savingBackup,
    keysInLocalStorage,
    // Human readable backup state for conditional rendering

    backupData,
    // Methods
    regeneratePassphrase,
    canRegenerate,
    setPassphrase,
    makeBackup,
    restoreFromBackup,
    routeToKeyRestore,
    beginReset,
    confirmReset,
    cancelReset,
    deleteFiles,
    filesDeleted,
    deleteFailed,
    resetDeleteFiles,
    // Passphrase
    words,
    passphraseString,
  };
};
