<script setup lang="ts">
import useFolderStore from '@/apps/send/stores/folder-store';
import useSharingStore from '@/apps/send/stores/sharing-store';
import { trpc } from '@/lib/trpc';
import { useMutation } from '@tanstack/vue-query';
import { ref } from 'vue';

import Btn from '@/apps/send/elements/BtnComponent.vue';
import FileNameForm from '@/apps/send/elements/FileNameForm.vue';
import { formatBytes } from '@/lib/utils';
import { IconDownload, IconEye, IconEyeOff, IconLink } from '@tabler/icons-vue';
import { useClipboard, useDebounceFn } from '@vueuse/core';

const folderStore = useFolderStore();
const sharingStore = useSharingStore();

const showRenameForm = ref(false);

const password = ref('');
const expiration = ref(null);
const accessUrl = ref('');
const showPassword = ref(false);
const tooltipText = ref('Copied to clipboard');
const clipboard = useClipboard();
const accessUrlInput = ref<HTMLInputElement | null>(null);

const { mutate } = useMutation({
  mutationKey: ['getAccessLink'],
  mutationFn: async () => {
    const [url, hash] = accessUrl.value.split('share/')[1].split('#');
    await trpc.addPasswordToAccessLink.mutate({
      linkId: url,
      password: hash,
    });
  },
});

function copyToClipboard(url: string) {
  clipboard.copy(url);
  tooltipText.value = 'Copied!';
  setTimeout(() => {
    tooltipText.value = 'Click to copy';
  }, 3000);
}

async function shareIndividualFile() {
  const url = await sharingStore.shareItems(
    [folderStore.selectedFile],
    password.value,
  );

  // if (!url) {
  //   emit('createAccessLinkError');
  //   return;
  // }

  accessUrl.value = url;

  if (!password.value.length) {
    mutate();
  }

  // Copy url to clipboard
  clipboard.copy(url);

  // Focus the input
  accessUrlInput.value?.focus();


}

/*
Note about shareOnly containers.
- if this file is in a shareOnly Container, show the sharing controls here (because the Container was only created for the purpose of sharing this Item)
- TODO: decide what to do if there were multiple Items shared via the same shareOnly Container.
*/
</script>

<template>
  <div v-if="folderStore.selectedFile" class="flex flex-col gap-6 h-full">
    <!-- info -->
    <header class="flex flex-col items-center">
      <img src="@/apps/send/assets/file.svg" class="w-20 h-20" />
      <div class="font-semibold pt-4">
        <span v-if="!showRenameForm" class="cursor-pointer" @click="showRenameForm = true">
          {{ folderStore.selectedFile.name }}
        </span>
        <FileNameForm v-if="showRenameForm" @rename-complete="showRenameForm = false" />
      </div>
      <div class="text-xs">
        {{ formatBytes(folderStore.selectedFile.upload.size) }}
      </div>
    </header>
  <section class="form-section">
    <label class="form-label">
      <span class="label-text">Create Share Link</span>
      <input
        ref="accessUrlInput"
        v-model="accessUrl"
        v-tooltip="tooltipText"
        type="text"
        class="input-field"
        @click="copyToClipboard(accessUrl)"
      />
    </label>
    <label class="form-label">
      <span class="label-text">Link Expires</span>
      <input v-model="expiration" type="datetime-local" />
    </label>
    <label class="form-label password-field">
      <span class="label-text">Password</span>
      <input
        v-model="password"
        data-testid="password-input"
        :type="showPassword ? 'text' : 'password'"
      />
      <button
        class="toggle-password"
        @click.prevent="showPassword = !showPassword"
      >
        <IconEye v-if="showPassword" class="icon" />
        <IconEyeOff v-else class="icon" />
      </button>
    </label>
  </section>
  <Btn
    class="create-button"
    data-testid="create-share-link"
    @click="shareIndividualFile"
  >
    Create Share Link
    <IconLink class="icon" />
  </Btn>

    <footer class="mt-auto flex flex-col gap-3">
      <label
        v-if="folderStore.selectedFile.createdAt"
        class="flex flex-col gap-1"
      >
        <span class="text-xs font-semibold text-gray-600">Created</span>
        <div class="text-xs">{{ folderStore.selectedFile.createdAt }}</div>
      </label>
      <label
        v-if="folderStore.selectedFile.updatedAt"
        class="flex flex-col gap-1"
      >
        <span class="text-xs font-semibold text-gray-600">Modified</span>
        <div class="text-xs">{{ folderStore.selectedFile.updatedAt }}</div>
      </label>
      <label
        v-if="folderStore.selectedFile.upload.expired"
        class="flex flex-col gap-1"
      >
        <span class="text-xs font-semibold text-red-600">Expired</span>
      </label>
      <div class="flex justify-end gap-2">
        <Btn v-if="!folderStore.selectedFile.upload.expired"
          ><IconDownload
            class="w-4 h-4"
            @click="
              folderStore.downloadContent(
                folderStore.selectedFile.uploadId,
                folderStore.selectedFile.containerId,
                folderStore.selectedFile.wrappedKey,
                folderStore.selectedFile.name
              )
            "
        /></Btn>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.form-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.form-label {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.label-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgb(75, 85, 99);
}

.password-field {
  position: relative;
}

.toggle-password {
  position: absolute;
  right: 0.75rem;
  bottom: 0.5rem;
  user-select: none;
}

.icon {
  width: 1rem;
  height: 1rem;
}

.create-button {
  margin-bottom: 2rem;
}
</style>
