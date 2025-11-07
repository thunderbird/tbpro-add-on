<script setup lang="ts">
import { onMounted, ref } from 'vue';

import init from '@send-frontend/lib/init';

import useKeychainStore from '@send-frontend/stores/keychain-store';
import useUserStore from '@send-frontend/stores/user-store';

import ErrorUploading from '@send-frontend/apps/send/components/ErrorUploading.vue';
import { useUploadAndShare } from '@send-frontend/apps/send/composables/useUploadAndShare';
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';

import {
  ALL_UPLOADS_ABORTED,
  FIFTEEN_MINUTES,
  FILE_LIST,
  MAX_FILE_SIZE,
  POPUP_READY,
} from '@send-frontend/lib/const';
import { ERROR_MESSAGES } from '@send-frontend/lib/errorMessages';
import { restoreKeysUsingLocalStorage } from '@send-frontend/lib/keychain';
import { canUploadQuery } from '@send-frontend/lib/queries';
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

const folderStore = useFolderStore();
const { isError, uploadAndShare } = useUploadAndShare();

const isAllowed = ref(true);
const files = ref<FileItem[] | null>(null);
const message = ref('');

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

const { error: cannotUpload } = useQuery({
  queryKey: ['can-upload'],
  queryFn: canUploadQuery,
  retry: false,
  staleTime: FIFTEEN_MINUTES,
});

onMounted(async () => {
  try {
    await restoreKeysUsingLocalStorage(keychain, api);
    await init(userStore, keychain, folderStore);
    console.log(`adding listener in Popup for runtime messages`);

    browser.runtime.onMessage.addListener(async (message) => {
      if (message.type === FILE_LIST) {
        files.value = message.files;
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

  // At the very end we have to validate that everything is in order for the upload to happen
  const { hasBackedUpKeys, isTokenValid, hasForcedLogin } = await validators();

  if (!hasBackedUpKeys) {
    isAllowed.value = false;
    message.value = `Please make sure you have backed up or restored your keys. Go back to the compositon panel and follow the instructions`;
    return;
  }
  if (!isTokenValid || hasForcedLogin) {
    isAllowed.value = false;
    message.value = `You're not logged in properly. Please go back to the compositon panel to log back in`;
    return;
  }

  // Check if the filesize is allowed.
  // Using a for loop so we can return.
  for (let i = 0; i < files.value?.length; i++) {
    const file = files.value[i].data;
    if (file.size > MAX_FILE_SIZE) {
      progress.error = ERROR_MESSAGES.SIZE_EXCEEDED;
      console.log(`Max file size exceeded`);
      isError.value = true;

      browser.runtime.sendMessage({
        type: ALL_UPLOADS_ABORTED,
        url: '',
        aborted: true,
      });

      return;
    }
  }
  // TODO: do this for each file
});
</script>

<template>
  <!-- We only show the error message when storage limit has been exceeded -->
  <h1 v-if="cannotUpload">{{ cannotUpload }}</h1>

  <div v-if="isAllowed && !cannotUpload">
    <div v-if="isError">
      <ErrorUploading />
    </div>

    <div>
      <UploadPage :files="files" :on-upload-and-share="handleUploadAndShare" />
    </div>
  </div>
  <div v-else>
    <p>{{ message }}</p>
  </div>
</template>
