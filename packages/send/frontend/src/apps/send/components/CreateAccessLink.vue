<script setup lang="ts">
import NewAccessLink from '@send-frontend/apps/send/components/NewAccessLink.vue';
import useSharingStore from '@send-frontend/apps/send/stores/sharing-store';
import { ExpirationOption, getExpirationDate } from '@send-frontend/lib/utils';
import { ref, watch } from 'vue';

import Btn from '@send-frontend/apps/send/elements/BtnComponent.vue';
import { IconEye, IconEyeOff, IconLink } from '@tabler/icons-vue';
import { useClipboard, useDebounceFn } from '@vueuse/core';
import { useMutation } from '@tanstack/vue-query';
import { trpc } from '@send-frontend/lib/trpc';

const sharingStore = useSharingStore();

const props = defineProps<{
  folderId: string;
}>();

const emit = defineEmits(['createAccessLinkComplete', 'createAccessLinkError']);

const password = ref('');
const selectedExpiration = ref<ExpirationOption>('14days');
const customDateTime = ref('');
const accessUrl = ref('');
const showPassword = ref(false);
const clipboard = useClipboard();
const isLoading = ref(false);
const errorMessage = ref('');

const refreshAccessLinks = useDebounceFn(async () => {
  await sharingStore.fetchFolderAccessLinks(props.folderId);
}, 1000);

const { mutate } = useMutation({
  mutationKey: ['markAccessLinkAsPasswordless'],
  mutationFn: async ({ linkId }: { linkId: string }) => {
    await trpc.markAccessLinkAsPasswordless.mutate({
      linkId,
    });
  },
  onError: (error) => {
    // Display-only failure: the link itself works, it just stays listed as
    // password-protected until the flag is corrected.
    console.error('Could not mark access link as passwordless', error);
    errorMessage.value =
      'The link was created, but its password status could not be updated.';
  },
});

async function newAccessLink() {
  isLoading.value = true;
  try {
    const url = await sharingStore.createAccessLink(
      props.folderId,
      password.value,
      getExpirationDate(selectedExpiration.value, customDateTime.value)
    );

    if (!url) {
      emit('createAccessLinkError');
      errorMessage.value = 'Failed to create access link. Please try again.';
      isLoading.value = false;
      return;
    }

    if (!password.value.length) {
      // Tell the backend this link is passwordless. `url` is the full shareable
      // URL (…/share/<id>#<secret>); the server only ever needs the bare id.
      const linkId = url.split('/').pop()?.split('#')[0] || '';
      mutate({ linkId });
    }

    // The full URL is shown once (see NewAccessLink) and copied to the
    // clipboard. It is never sent to the server: for a link created without
    // a password the secret exists only in the fragment of this URL.
    accessUrl.value = url;
    clipboard.copy(url);

    await refreshAccessLinks();
    isLoading.value = false;
  } catch (error) {
    emit('createAccessLinkError');
    errorMessage.value =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    isLoading.value = false;
  }
}

watch(
  () => props.folderId,
  () => {
    password.value = '';
    selectedExpiration.value = '14days';
    customDateTime.value = '';
    accessUrl.value = '';
    showPassword.value = false;
    errorMessage.value = '';
  }
);
</script>
<template>
  <section class="form-section">
    <label class="form-label">
      <span class="label-text">Link Expires</span>
      <select
        :value="selectedExpiration"
        @change="
          selectedExpiration = ($event.target as HTMLSelectElement)
            .value as ExpirationOption
        "
      >
        <option value="never">Never expire</option>
        <option value="24hours">Expire in 24 hours</option>
        <option value="14days">Expire in 14 days (default)</option>
        <option value="30days">Expire in 30 days</option>
        <option value="custom">Custom date and time</option>
      </select>
      <input
        v-if="selectedExpiration === 'custom'"
        v-model="customDateTime"
        type="datetime-local"
      />
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

  <NewAccessLink v-if="accessUrl" :url="accessUrl" :has-password="!!password" />
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
  color: var(--critical);
  padding: 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
</style>
