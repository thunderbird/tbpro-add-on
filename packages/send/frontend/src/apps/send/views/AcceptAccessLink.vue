<script setup lang="ts">
import useSharingStore from '@send-frontend/apps/send/stores/sharing-store';
import { onMounted, ref } from 'vue';

import { getCanRetry } from '@send-frontend/lib/validations';
import { useRoute } from 'vue-router';
import BtnComponent from '../elements/BtnComponent.vue';
import DownloadTemplate from './DownloadTemplate.vue';

const emit = defineEmits(['acceptAccessLinkComplete']);

const password = ref('');
const message = ref('');
const error = ref('');
const passwordInput = ref<HTMLInputElement | null>(null);
const isLocked = ref(false);

const route = useRoute();

const sharingStore = useSharingStore();

async function accept() {
  if (isLocked.value) return;
  error.value = ''; // Clear previous errors
  const linkId = route.params.linkId as string;
  const isValid = await sharingStore.isAccessLinkValid(linkId);
  const canRetry = await getCanRetry(linkId);

  if (!isValid || !canRetry) {
    error.value = 'Access Link is no longer valid';
    isLocked.value = true;
    return;
  }

  try {
    const success = await sharingStore.acceptAccessLink(linkId, password.value);
    if (success) {
      message.value = `and this is where we add the container to the group and then redirect`;

      /*
      This functionality has been disabled until we test it
      We want users to be able to download files without adding them to their folers
       */
      // if (user.id) {
      //   // Users will go to send home
      //   router.push(`/send`);
      // } else {
      //   // Non-users stay at this route
      //   emit('acceptAccessLinkComplete');
      // }
      emit('acceptAccessLinkComplete');
    } else {
      error.value = 'This password is incorrect';
    }
  } catch (e) {
    console.error(e);
    error.value = 'An error occurred while processing your request';
  }
}

onMounted(() => {
  const { hash } = window.location;
  if (hash) {
    password.value = hash.substring(1);
    accept();
  } else {
    // Focus the password input if no hash is present
    passwordInput.value?.focus();
  }
});
</script>

<template>
  <DownloadTemplate>
    <h3>This file is password protected</h3>
    <form class="flex gap-2 flex-col" @submit.prevent="accept">
      <label class="">
        <div class="flex gap-1">
          <p class="passwordText">Password</p>
          <span class="critical">*</span>
        </div>

        <input
          ref="passwordInput"
          v-model="password"
          data-testid="password-input"
          autocomplete="section-main password"
          type="password"
          required
        />
      </label>
      <p class="prompt">Enter the password provided by the sender</p>

      <div v-if="message">{{ message }}</div>

      <div v-if="error" class="error-message" style="color: red">
        {{ error }}
      </div>
      <div>
        <BtnComponent
          data-testid="submit-button"
          primary
          size="medium"
          class="btn-primary"
          type="submit"
          >Continue</BtnComponent
        >
      </div>
    </form>
  </DownloadTemplate>
</template>

<style lang="css" scoped>
h1 {
  font-size: 24px;
  font-weight: 500;
  color: var(--colour-primary-default);
}
h3 {
  font-size: 20px;
}
.prompt {
  color: var(--color-send-muted);
  font-size: 11px;
}
.critical {
  color: var(--critical);
}
input {
  height: 44px;
  align-self: stretch;
  flex-grow: 0;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  box-shadow: inset 2px 2px 4px 0 rgba(0, 0, 0, 0.05);
  border: solid 1px rgb(228, 228, 231);
  background-color: var(--neutral-base);
  width: 100%;
  max-width: 38rem;
}
.passwordText {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-icon-secondary);
}
</style>
