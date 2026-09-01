<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import init from '@send-frontend/lib/init';

import useKeychainStore from '@send-frontend/stores/keychain-store';
import useUserStore from '@send-frontend/stores/user-store';

import ErrorUploading from '@send-frontend/apps/send/components/ErrorUploading.vue';
import { useUploadAndShare } from '@send-frontend/apps/send/composables/useUploadAndShare';
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';

import ProButton from '@send-frontend/apps/common/ProButton.vue';
import WithLoader from '@send-frontend/apps/common/WithLoader.vue';
import { BASE_URL } from '@send-frontend/apps/common/constants';
import PromptPopupLogin from '@send-frontend/apps/send/views/PromptLogin.vue';
import { useAuth } from '@send-frontend/lib/auth';
import {
  ALL_UPLOADS_ABORTED,
  FILE_LIST,
  MAX_FILE_SIZE,
  POPUP_READY,
  SIGN_OUT,
} from '@send-frontend/lib/const';
import { ERROR_MESSAGES } from '@send-frontend/lib/errorMessages';
import { restoreKeysUsingLocalStorage } from '@send-frontend/lib/keychain';
import { openPopup } from '@send-frontend/lib/login';
import { CLIENT_MESSAGES } from '@send-frontend/lib/messages';
import { canUploadQuery } from '@send-frontend/lib/queries';
import {
  findUploadBlocker,
  type UploadReadiness,
} from '@send-frontend/lib/uploadReadiness';
import useApiStore from '@send-frontend/stores/api-store';
import { useQuery } from '@tanstack/vue-query';
import UploadPage from '../pages/UploadPage.vue';
import { useStatusStore } from '../stores/status-store';

interface FileItem {
  id: number;
  name: string;
  data: File;
}

const userStore = useUserStore();
const { keychain } = useKeychainStore();
const { api } = useApiStore();
const { validators, progress } = useStatusStore();
const { isLoggedIn, refetchAuth, isLoadingAuth } = useAuth();

const folderStore = useFolderStore();
const { isError: uploadingError, uploadAndShare } = useUploadAndShare();

const files = ref<FileItem[] | null>(null);

async function handleUploadAndShare(
  files: FileItem[],
  password: string,
  expiration?: string,
  onStatusUpdate?: (
    fileIndex: number,
    status: 'pending' | 'uploading' | 'completed' | 'error'
  ) => void
) {
  if (!files || files.length === 0) {
    return;
  }
  await uploadAndShare(files, password, expiration, onStatusUpdate);
}

const { error: uploadBlockedDuetoSize } = useQuery({
  queryKey: ['can-upload'],
  queryFn: canUploadQuery,
});

const {
  data: readiness,
  refetch,
  isLoading: isLoadingConfigured,
} = useQuery({
  queryKey: ['is-configured-for-upload'],
  queryFn: async (): Promise<UploadReadiness> => {
    await refetchAuth();
    // At the very end we have to validate that everything is in order for the upload to happen
    const blocker = findUploadBlocker(await validators());
    if (blocker) {
      return blocker;
    }
    // If everything is fine, we initialize the app
    await initialize();
    return { status: 'ready' };
  },
  refetchOnWindowFocus: true,
  refetchOnMount: true,
});

const isConfigured = computed(() => readiness.value?.status === 'ready');

const isSecurityPopupOpen = ref(false);

// Latched, and deliberately never reset: the setup window may open itself at
// most once per popup. `isSecurityPopupOpen` cannot do this job because the
// close callback clears it, which is exactly how the window came to reopen
// every time the readiness check answered "not set up" again (Bugzilla 2064458).
const hasAutoOpenedSetup = ref(false);
// Set when the setup window closes, so a second visit can say setup didn't
// finish rather than silently showing the same prompt again.
const hasClosedSetupWindow = ref(false);

// When the user isn't set up for uploads, send them to the Security & Privacy
// page in its own window instead of embedding the backup/restore flow in this
// small popup. We only re-check configuration once that window is closed.
async function openSecurityPopup() {
  if (isSecurityPopupOpen.value) {
    return;
  }
  isSecurityPopupOpen.value = true;
  // `closeOnComplete` tells the page to close itself once the passphrase has
  // been accepted; that close triggers the callback below, which re-checks
  // configuration and advances to the upload flow.
  const opened = await openPopup(
    `${BASE_URL}/send/security-and-privacy?closeOnComplete=true`,
    () => {
      isSecurityPopupOpen.value = false;
      hasClosedSetupWindow.value = true;
      refetch();
    }
  );
  // If the window failed to open, reset so the user isn't stuck with the retry
  // button hidden and no window on screen.
  if (!opened) {
    isSecurityPopupOpen.value = false;
  }
}

// Only the status matters; each refetch hands back a fresh object.
watch(
  () => readiness.value?.status,
  (status) => {
    // Only a positive "no key backup" answer may open the setup window: no
    // other state is one the setup flow can resolve.
    if (
      status !== 'needs-setup' ||
      !isLoggedIn.value ||
      hasAutoOpenedSetup.value
    ) {
      return;
    }
    hasAutoOpenedSetup.value = true;
    openSecurityPopup();
  }
);

const initialize = async () => {
  try {
    await restoreKeysUsingLocalStorage(keychain, api);
    await init(userStore, keychain, folderStore);
    console.log(`adding listener in Popup for runtime messages`);

    browser.runtime.onMessage.addListener(async (message) => {
      if (message.type === FILE_LIST) {
        files.value = message.files;
      } else if (message.type === SIGN_OUT) {
        // Session ended -- clear any pending uploads and let the
        // logged-out UI render via the isLoggedIn watcher. The popup
        // may also be closed by background.ts in the same SIGN_OUT
        // handling, but doing this here is defensive in case the popup
        // survives (e.g. a web-tab sign-out that didn't close us).
        // See https://github.com/thunderbird/tbpro-add-on/issues/1019.
        files.value = [];
      }
    });

    browser.runtime.sendMessage({
      type: POPUP_READY,
    });
  } catch {
    console.log(
      `Cannot access browser.runtime, probably not running as an extension`
    );
  }

  // Check if the filesize is allowed.
  // Using a for loop so we can return.
  for (let i = 0; i < files.value?.length; i++) {
    const file = files.value[i].data;
    if (file.size > MAX_FILE_SIZE) {
      progress.error = ERROR_MESSAGES.SIZE_EXCEEDED;
      console.log(`Max file size exceeded`);
      uploadingError.value = true;

      browser.runtime.sendMessage({
        type: ALL_UPLOADS_ABORTED,
        url: '',
        aborted: true,
      });

      return;
    }
  }
  // TODO: do this for each file
};
</script>

<template>
  <WithLoader :is-loading="isLoadingAuth || isLoadingConfigured">
    <PromptPopupLogin v-if="!isLoggedIn" />
    <div v-else>
      <div v-if="!isConfigured" class="finish-setup" data-testid="finish-setup">
        <!-- No "Continue Setup" here: the passphrase flow cannot fix a
             blocked cookie, and offering it is what left users clicking a
             dialog that closed itself. -->
        <template v-if="readiness?.status === 'cookies-blocked'">
          <h1 data-testid="cookies-blocked-title">
            {{ CLIENT_MESSAGES.COOKIES_BLOCKED_TITLE }}
          </h1>
          <p data-testid="cookies-blocked-body">
            {{ CLIENT_MESSAGES.COOKIES_BLOCKED_BODY }}
          </p>
          <ProButton data-testid="recheck-readiness" @click="refetch">
            Check again
          </ProButton>
        </template>

        <template v-else-if="readiness?.status === 'needs-setup'">
          <h1>Finish setting up Send</h1>
          <p>
            To continue your upload, please complete your passphrase
            setup/recovery.
          </p>
          <p v-if="hasClosedSetupWindow" data-testid="setup-did-not-complete">
            {{ CLIENT_MESSAGES.SETUP_DID_NOT_COMPLETE }}
          </p>
          <ProButton
            v-if="!isSecurityPopupOpen"
            data-testid="continue-setup"
            @click="openSecurityPopup"
          >
            Continue Setup
          </ProButton>
        </template>

        <template v-else-if="readiness?.status === 'signed-out'">
          <h1>You're signed out</h1>
          <p data-testid="signed-out-body">
            {{ CLIENT_MESSAGES.SIGNED_OUT_RETURN_TO_COMPOSE }}
          </p>
        </template>

        <template v-else>
          <h1>Send couldn't check your setup</h1>
          <p data-testid="readiness-unknown">
            {{ CLIENT_MESSAGES.SETUP_CHECK_FAILED }}
          </p>
          <ProButton data-testid="recheck-readiness" @click="refetch">
            Check again
          </ProButton>
        </template>
      </div>
      <div v-else>
        <!-- We only show the error message when storage limit has been exceeded -->
        <h1 v-if="uploadBlockedDuetoSize">{{ uploadBlockedDuetoSize }}</h1>

        <div v-if="!uploadBlockedDuetoSize">
          <div v-if="uploadingError">
            <ErrorUploading />
          </div>

          <div>
            <UploadPage
              :files="files"
              :on-upload-and-share="handleUploadAndShare"
            />
          </div>
        </div>
      </div>
    </div>
  </WithLoader>
</template>

<style lang="css" scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
.finish-setup {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 1rem;
  padding: 2rem;
}
</style>
