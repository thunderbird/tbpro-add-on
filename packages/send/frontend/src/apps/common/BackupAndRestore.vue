<script setup lang="ts">
import { computed, ref } from 'vue';

import useKeychainStore from '@send-frontend/stores/keychain-store';

// move the following imports elsewhere
import { useAuth } from '@send-frontend/lib/auth';
import { dbUserSetup } from '@send-frontend/lib/helpers';
import { backupKeys, restoreKeys } from '@send-frontend/lib/keychain';
import { generatePassphrase } from '@send-frontend/lib/passphrase';
import { downloadPassPhrase } from '@send-frontend/lib/passphraseUtils';
import { trpc } from '@send-frontend/lib/trpc';
import useApiStore from '@send-frontend/stores/api-store';
import useMetricsStore from '@send-frontend/stores/metrics';
import useUserStore from '@send-frontend/stores/user-store';
import { useMutation, useQuery } from '@tanstack/vue-query';
import { LoadingSkeleton } from '@thunderbirdops/services-ui';
import { useExtensionStore } from '../send/stores/extension-store';
import useFolderStore from '../send/stores/folder-store';
import AccessLocked from '../send/views/AccessLocked.vue';
import BackupKeys from '../send/views/BackupKeys.vue';
import ResetEncryptionKey from '../send/views/ResetEncryptionKey.vue';
import RestoreKeys from '../send/views/RestoreKeys.vue';
import SecurityAndPrivacy from '../send/views/SecurityAndPrivacy.vue';
import { PHRASE_SIZE } from './constants';
const userStore = useUserStore();
const folderStore = useFolderStore();
const { logOutAuth } = useAuth();

const words = ref(generatePassphrase(PHRASE_SIZE));

const regeneratePassphrase = () => {
  words.value = generatePassphrase(PHRASE_SIZE);
};

const passphraseString = computed(() => {
  return words.value.join(' ');
});

const setPassphrase = (newPassphrase: string) => {
  let res = newPassphrase.replace(/\s+/g, '');
  console.log('newPassphrase', res);

  words.value = res.split('-');
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
const bigMessageDisplay = ref('');
const shouldRestore = ref(false);
const shouldBackup = ref(false);
const hasBackedUpKeys = ref<string>(null);
const shouldUnlock = ref(false);
const shouldReset = ref(false);

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

if (
  !!passphraseFromLocalStorage &&
  passphraseFromLocalStorage !== passphraseString.value
) {
  words.value = passphraseFromLocalStorage.split(' ');
}

function hideBackupRestore() {
  shouldRestore.value = false;
  shouldBackup.value = false;
}

const { isLoading: isLoadingBackup } = useQuery({
  queryKey: ['keybackup'],
  refetchOnMount: true,
  queryFn: async () => {
    const keybackup = await getBackup();
    hasBackedUpKeys.value = keybackup?.backupKeypair;
    if (!hasBackedUpKeys.value) {
      shouldBackup.value = true;
    } else {
      if (!keychain.getPassphraseValue()) {
        shouldRestore.value = true;
      }
    }
    return keybackup;
  },
});

const showKeyRecovery = computed(() => {
  return shouldBackup.value || shouldRestore.value;
});

async function makeBackup() {
  bigMessageDisplay.value = '';
  keychain.storePassPhrase(passphraseString.value);

  try {
    await backupKeys(keychain, api, bigMessageDisplay);
    await downloadPassPhrase(passphraseFromLocalStorage, email);
    hideBackupRestore();
    await dbUserSetup(userStore, keychain, folderStore);
    configureExtension();
  } catch (e) {
    console.error('Error backing up keys', e);
  }
}

async function restoreFromBackup() {
  bigMessageDisplay.value = '';

  try {
    await restoreKeys(keychain, api, bigMessageDisplay, passphraseString.value);
    keychain.storePassPhrase(passphraseString.value);
    hideBackupRestore();
    configureExtension();
  } catch (e) {
    metrics.capture('send.restoreKeys.error', {
      message: bigMessageDisplay.value,
    });
    bigMessageDisplay.value = e;
  }
}
</script>

<template>
  <section class="container">
    <div class="max-w-xl">
      <!-- Loading state -->
      <LoadingSkeleton
        v-if="isLoadingBackup"
        width="576px"
        height="86px"
        border-radius="9px"
        :is-loading="isLoadingBackup"
      />

      <!-- Key recovery -->
      <div v-else-if="showKeyRecovery">
        <section class="recovery-main" data-testid="key-recovery">
          <AccessLocked
            v-if="shouldRestore && !shouldUnlock"
            :on-recover="
              () => {
                shouldUnlock = true;
              }
            "
          />
          <BackupKeys
            v-if="shouldBackup"
            :make-backup="makeBackup"
            :words="words"
            :regenerate-passphrase="regeneratePassphrase"
            :log-out-auth="logOutAuth"
          />
          <RestoreKeys
            v-if="shouldUnlock"
            :restore-from-backup="restoreFromBackup"
            :set-passphrase="setPassphrase"
            :message="bigMessageDisplay"
            :on-reset="
              () => {
                shouldReset = true;
              }
            "
            @cancel="() => (shouldUnlock = false)"
          />
          <ResetEncryptionKey
            v-if="shouldReset"
            @confirm="resetKeys"
            @cancel="() => (shouldReset = false)"
          />
        </section>
      </div>
      <!-- After keys are restored we show security and privacy -->
      <SecurityAndPrivacy v-else :reset-keys="resetKeys" />
    </div>
  </section>
</template>

<style scoped>
h2 {
  font-size: 22px;
}
.toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1px 0px;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  gap: 1rem;
  padding: 1rem;
  background-color: var(--colour-neutral-border);
}

.content {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  border: solid 1px #e4e4e7;
  border-radius: 6px;
}

.recovery-main {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 0.75rem;
  /* padding: 0 1rem 1rem; */
}
</style>
