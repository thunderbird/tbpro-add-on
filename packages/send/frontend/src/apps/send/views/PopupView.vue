<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import init from '@/lib/init';

import useKeychainStore from '@/stores/keychain-store';
import useUserStore from '@/stores/user-store';

import ErrorUploading from '@/apps/send/components/ErrorUploading.vue';
import useFolderStore from '@/apps/send/stores/folder-store';
import useSharingStore from '@/apps/send/stores/sharing-store';

import ShieldIcon from '@/apps/common/ShieldIcon.vue';
import {
  POPUP_READY,
  MAX_FILE_SIZE,
  ALL_UPLOADS_ABORTED,
  ALL_UPLOADS_COMPLETE,
  FILE_LIST,
} from '@/lib/const';
import { ERROR_MESSAGES } from '@/lib/errorMessages';
import { restoreKeysUsingLocalStorage } from '@/lib/keychain';
import useApiStore from '@/stores/api-store';
import { IconEye, IconEyeClosed } from '@tabler/icons-vue';
import ProgressBar from '../components/ProgressBar.vue';
import { default as Btn } from '../elements/BtnComponent.vue';
import { useStatusStore } from '../stores/status-store';

const userStore = useUserStore();
const { keychain } = useKeychainStore();
const { api } = useApiStore();
const { validators, progress } = useStatusStore();

const folderStore = useFolderStore();
const sharingStore = useSharingStore();

const isUploading = ref(false);
const isError = ref(false);
const isAllowed = ref(true);

const uploadMap = ref<Map<number, boolean>>(new Map());
const files = ref<Record<string, any>[] | null>(null);
const password = ref('');

const message = ref('');
const passwordFieldType = ref<'password' | 'text'>('password');
const isPasswordProtected = ref(false);

const isPasswordVisible = computed(() => {
  return passwordFieldType.value === 'text';
});

// TODO: Make it so you can mix-and-match.
// i.e., you can convert attachment to tb send
// *and* you can choose existing files.
// Need to decide if you should be able to designate
// the location of the file from the tb send popup.
async function uploadAndShare() {
  isUploading.value = true;
  isError.value = false;
  let uploadedItems = [];

  for (const file of files.value) {
    try {
      // Note: folderStore.uploadItem returns an Array
      const itemObjArray = await folderStore.uploadItem(
        // TO-DO: We should fix this type
        // @ts-ignore
        file.data,
        folderStore.defaultFolder.id,
        api
      );

      if (!itemObjArray || itemObjArray.length === 0) {
        throw new Error(`Could not upload file ${file.name}`);
      }

      console.log(`[uploadAndShare] Successfully uploaded ${file.name}`);

      // We don't want nested arrays, we want a flat array of Items.
      //
      // In case itemObjArray has multiple items (because of multi part
      // uploads), we add each to the `uploadedItems` array.
      //
      // And we stamp each of these with the original file.id.
      // This will be reported back to `background.js` so that it can
      // mark it as complete.
      for (const itemObj of itemObjArray) {
        uploadedItems.push({
          originalId: file.id,
          ...itemObj,
        });
        uploadMap.value.set(file.id, true);
      }
    } catch (err) {
      console.log(err);
      uploadAborted();
      isError.value = true;
      isUploading.value = false;
      return;
    }
  }

  try {
    const url = await sharingStore.shareItems(uploadedItems, password.value);
    if (!url) {
      throw new Error(`Did not get URL back from sharingStore`);
    }
    console.log(`I got a sharing url and it is`);
    console.log(url);
    shareComplete(url, [...uploadedItems]);
  } catch (err) {
    console.log(err.message);

    shareAborted();
    isError.value = true;
    isUploading.value = false;
    return;
  }
}

function shareComplete(url: string, results: Record<string, any>[]) {
  browser.runtime.sendMessage({
    type: ALL_UPLOADS_COMPLETE,
    url,
    results,
    aborted: false,
  });

  window.close();
}

function uploadAborted() {
  browser.runtime.sendMessage({
    type: ALL_UPLOADS_ABORTED,
    aborted: true,
  });
}

function shareAborted() {
  browser.runtime.sendMessage({
    type: ALL_UPLOADS_ABORTED,
    aborted: true,
  });
  window.close();
}

function togglePasswordVisibility() {
  passwordFieldType.value =
    passwordFieldType.value === 'password' ? 'text' : 'password';
}

function togglePasswordField() {
  isPasswordProtected.value = !isPasswordProtected.value;
}

function indicatorForFile(fileId: number) {
  return uploadMap.value.get(fileId) ? `✅` : `⏳`;
}

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
  for (let i = 0; i < files.value.length; i++) {
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
  <div v-if="isAllowed">
    <div v-if="isError">
      <ErrorUploading />
    </div>

    <div v-if="isUploading">
      <ProgressBar />
    </div>
    <div>
      <ul>
        <li v-for="file in files" :key="file.id">
          <span>{{ indicatorForFile(file.id) }}</span>
          {{ file.name }}
        </li>
      </ul>
    </div>
    <form v-if="!isError" @submit.prevent="uploadAndShare">
      <div class="flex items-center gap-x-2">
        <input
          type="checkbox"
          :disabled="isUploading"
          @click="togglePasswordField"
        />
        <h3 class="font-semibold">Require password</h3>
      </div>

      <div v-if="isPasswordProtected" class="password">
        <input
          v-model="password"
          :type="passwordFieldType"
          :disabled="isUploading"
          class="w-full"
        />
        <button @click.prevent="togglePasswordVisibility">
          <IconEye v-if="!isPasswordVisible" />
          <IconEyeClosed v-if="isPasswordVisible" />
        </button>
      </div>

      <p class="mb-6">
        The recipient will need this password to access this file.
      </p>

      <div class="flex justify-center">
        <Btn primary class="max-w-md">
          <ShieldIcon />
          <input
            type="submit"
            value="Encrypt and Upload"
            :disabled="isUploading"
          />
        </Btn>
      </div>
    </form>
  </div>
  <div v-else>
    <p>{{ message }}</p>
  </div>
</template>

<style scoped>
h2 {
  font-size: 13px;
}
p {
  font-size: 10px;
  font-weight: 400;
}

form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 320px;
  margin-bottom: 2rem;
}

.password {
  position: relative;
}
.password button {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
}
</style>
