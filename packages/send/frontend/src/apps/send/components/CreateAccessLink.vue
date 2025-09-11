<script setup lang="ts">
import useSharingStore from '@send-frontend/apps/send/stores/sharing-store';
import { trpc } from '@send-frontend/lib/trpc';
import { useMutation } from '@tanstack/vue-query';
import { ref, watch } from 'vue';

import Btn from '@send-frontend/apps/send/elements/BtnComponent.vue';
import { IconEye, IconEyeOff, IconLink } from '@tabler/icons-vue';
import { useClipboard, useDebounceFn } from '@vueuse/core';

const sharingStore = useSharingStore();

const props = defineProps<{
  folderId: string;
}>();

const emit = defineEmits(['createAccessLinkComplete', 'createAccessLinkError']);

const password = ref('');
const expiration = ref(null);
const accessUrl = ref('');
const showPassword = ref(false);
const tooltipText = ref('Copied to clipboard');
const clipboard = useClipboard();
const accessUrlInput = ref<HTMLInputElement | null>(null);
const isLoading = ref(false);
const errorMessage = ref('');

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

const refreshAccessLinks = useDebounceFn(async () => {
  await sharingStore.fetchFolderAccessLinks(props.folderId);
}, 1000);

function copyToClipboard(url: string) {
  clipboard.copy(url);
  tooltipText.value = 'Copied!';
  setTimeout(() => {
    tooltipText.value = 'Click to copy';
  }, 3000);
}

async function newAccessLink() {
  isLoading.value = true;
  try {
    const url = await sharingStore.createAccessLink(
      props.folderId,
      password.value,
      expiration.value
    );

    if (!url) {
      emit('createAccessLinkError');
      errorMessage.value = 'Failed to create access link. Please try again.';
      isLoading.value = false;
      return;
    }

    accessUrl.value = url;

    if (!password.value.length) {
      mutate();
    }

    // Copy url to clipboard
    clipboard.copy(url);

    // Focus the input
    accessUrlInput.value?.focus();

    await refreshAccessLinks();
    isLoading.value = false;
  } catch (error) {
    emit('createAccessLinkError');
    errorMessage.value = error;
    isLoading.value = false;
  }
}

watch(
  () => props.folderId,
  () => {
    password.value = '';
    expiration.value = null;
    accessUrl.value = '';
    showPassword.value = false;
    errorMessage.value = '';
  }
);
</script>
<template>
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

  <!-- Error message display -->
  <div v-if="errorMessage" class="error-message" data-testid="error-message">
    {{ errorMessage }}
  </div>

  <Btn
    class="create-button"
    data-testid="create-share-link"
    :disabled="isLoading"
    @click="newAccessLink"
  >
    <div v-if="isLoading">
      <p>Creating...</p>
    </div>
    <div v-else class="flex justify-center items-center gap-2">
      <span>Create Access Link</span>
      <IconLink class="icon" />
    </div>
  </Btn>
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

.error-message {
  background-color: #fee2e2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
</style>
