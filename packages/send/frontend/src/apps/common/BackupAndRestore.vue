<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import StatusBar from '@send-frontend/apps/common/StatusBar.vue';
import useKeychainStore from '@send-frontend/stores/keychain-store';

// move the following imports elsewhere
import { useAuth } from '@send-frontend/lib/auth';
import { downloadTxt } from '@send-frontend/lib/filesync';
import { dbUserSetup } from '@send-frontend/lib/helpers';
import { backupKeys, restoreKeys } from '@send-frontend/lib/keychain';
import { generatePassphrase } from '@send-frontend/lib/passphrase';
import { trpc } from '@send-frontend/lib/trpc';
import useApiStore from '@send-frontend/stores/api-store';
import useMetricsStore from '@send-frontend/stores/metrics';
import useUserStore from '@send-frontend/stores/user-store';
import { useMutation } from '@tanstack/vue-query';
import { useExtensionStore } from '../send/stores/extension-store';
import useFolderStore from '../send/stores/folder-store';
import { PHRASE_SIZE } from './constants';
import ExpandIcon from './ExpandIcon.vue';
import KeyRecovery from './KeyRecovery.vue';
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
const shouldOverrideVisibility = ref(false);

const { mutate: resetKeys } = useMutation({
  mutationKey: ['resetKeys'],
  mutationFn: async () => {
    await trpc.resetKeys.mutate();
  },
  onSuccess: async () => {
    await logOutAuth();
    // Make sure we clear the user from storage
    await clearUserFromStorage();
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

onMounted(async () => {
  const keybackup = await getBackup();
  hasBackedUpKeys.value = keybackup?.backupKeypair;
  if (!hasBackedUpKeys.value) {
    shouldBackup.value = true;
    bigMessageDisplay.value =
      '⚠️ Please write down your backup keys and click "Encrypt and backup keys" ⚠️';
  } else {
    if (!keychain.getPassphraseValue()) {
      bigMessageDisplay.value = '⚠️ Please restore your keys from backup ⚠️';
      shouldRestore.value = true;
    }
  }
});

const toggleVisible = () => {
  shouldOverrideVisibility.value = !shouldOverrideVisibility.value;
};

const showKeyRecovery = computed(() => {
  return (
    shouldBackup.value ||
    shouldRestore.value ||
    !!shouldOverrideVisibility.value
  );
});

const downloadPassPhrase = async () => {
  await downloadTxt(
    words.value.join(' - '),
    `tb-send-passphrase-${email}-key.txt`
  );
};

async function makeBackup() {
  bigMessageDisplay.value = '';
  const userConfirmed = confirm(
    'Are you sure you want to backup your keys? You will not be able to change your passphrase after this.'
  );

  if (!userConfirmed) {
    return;
  }
  keychain.storePassPhrase(passphraseString.value);

  try {
    await backupKeys(keychain, api, bigMessageDisplay);
    await downloadPassPhrase();
    hideBackupRestore();
    await dbUserSetup(userStore, keychain, folderStore);
    configureExtension();
  } catch (e) {
    console.error('Error backing up keys', e);
  }
}

async function restoreFromBackup() {
  if (!confirm('Replace all your local keys with your backup?')) {
    return;
  }

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
    <div class="content max-w-xl">
      <div
        :onclick="toggleVisible"
        class="toggle"
        data-testid="toggle-key-recovery"
      >
        <h3 class="font-bold">Recovery Key</h3>
        <ExpandIcon :is-open="showKeyRecovery" />
      </div>
      <p
        v-if="bigMessageDisplay"
        data-testid="big-message-display"
        style="font-size: larger"
      >
        {{ bigMessageDisplay }}
      </p>
      <div v-if="showKeyRecovery">
        <main class="recovery-main" data-testid="key-recovery">
          <key-recovery
            :make-backup="makeBackup"
            :restore-from-backup="restoreFromBackup"
            :should-backup="shouldBackup"
            :words="words"
            :should-restore="shouldRestore"
            :regenerate-passphrase="regeneratePassphrase"
            :set-passphrase="setPassphrase"
            :override-visibility="shouldOverrideVisibility"
            :download-passphrase="downloadPassPhrase"
            :reset-keys="resetKeys"
          />
        </main>
      </div>
    </div>
  </section>

  <StatusBar />
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
  padding: 0 1rem 1rem;
}
</style>
