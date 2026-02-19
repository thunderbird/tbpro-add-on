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

export const useBackupAndRestore = () => {
  const userStore = useUserStore();
  const folderStore = useFolderStore();
  const backupStore = useBackupStore();
  const { words, errorMessage, shouldUnlock, shouldReset, passphraseString } =
    storeToRefs(backupStore);
  const { logOutAuth } = useAuth();
  const { sendMessageToBridge } = useExtensionStore();
  const router = useRouter();

  // Initialize words if empty
  if (words.value.length === 0) {
    backupStore.setWords(generatePassphrase(PHRASE_SIZE));
  }

  const regeneratePassphrase = () => {
    backupStore.setWords(generatePassphrase(PHRASE_SIZE));
  };

  const setPassphrase = (newPassphrase: string) => {
    const parsedPassphrase = parsePassphrase(newPassphrase);
    backupStore.setWords(parsedPassphrase.split('-'));
  };

  const { api } = useApiStore();
  const {
    getBackup,
    user: { email },
    clearUserFromStorage,
  } = useUserStore();
  const { keychain } = useKeychainStore();
  const { metrics } = useMetricsStore();
  const { configureExtension } = useExtensionStore();

  onMounted(() => {
    configureExtension();
  });

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

  // User state actions
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

  const passphraseFromLocalStorage = keychain.getPassphraseValue();

  const allGood = computed(() => {
    return backupData.value === 'KEYS_IN_LOCAL_STORAGE';
  });

  watchEffect(() => {
    if (allGood.value) {
      console.log('Backup and restore completed');
      backupStore.setBackupCompleted(true);
    }
  });

  if (
    !!passphraseFromLocalStorage &&
    passphraseFromLocalStorage !== passphraseString.value
  ) {
    backupStore.setWords(passphraseFromLocalStorage.split(' '));
  }

  async function makeBackup() {
    backupStore.setErrorMessage('');
    keychain.storePassPhrase(passphraseString.value);

    try {
      await backupKeys(keychain, api, errorMessage);
      await downloadPassPhrase(passphraseString.value, email);
      await dbUserSetup(userStore, keychain, folderStore);
    } catch (e) {
      console.error('Error backing up keys', e);
    } finally {
      await refetch();
    }
  }

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

  async function routeToKeyRestore() {
    router.push('/send/security-and-privacy');
  }

  return {
    isLoadingBackup,
    backupData,
    errorMessage,
    passphraseString,
    regeneratePassphrase,
    setPassphrase,
    makeBackup,
    restoreFromBackup,
    shouldUnlock,
    routeToKeyRestore,
    shouldReset,
    resetKeys,
    words,
    allGood,
  };
};
