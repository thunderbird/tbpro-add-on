<script setup lang="ts">
import useSharingStore from '@send-frontend/apps/send/stores/sharing-store';
import { onMounted, ref } from 'vue';

import { getCanRetry } from '@send-frontend/lib/validations';
import { useRoute } from 'vue-router';
import BtnComponent from '../elements/BtnComponent.vue';
import DownloadTemplate from './DownloadTemplate.vue';

const emit = defineEmits(['acceptAccessLinkComplete']);

const password = ref('');
const error = ref('');
const attemptsHint = ref('');
const passwordInput = ref<HTMLInputElement | null>(null);
const isLocked = ref(false);

const route = useRoute();

const sharingStore = useSharingStore();

const INCORRECT_MESSAGE = 'This password is incorrect';
const LOCKED_MESSAGE =
  'This link has been locked after too many incorrect attempts.';

function attemptsText(attemptsRemaining?: number) {
  if (!attemptsRemaining) return '';
  return attemptsRemaining === 1
    ? '1 attempt remaining.'
    : `${attemptsRemaining} attempts remaining.`;
}

async function accept() {
  if (isLocked.value) return;
  error.value = ''; // Clear previous errors
  attemptsHint.value = '';
  const linkId = route.params.linkId as string;
  const isValid = await sharingStore.isAccessLinkValid(linkId);
  const canRetry = await getCanRetry(linkId);

  if (!isValid || !canRetry) {
    error.value = 'Access Link is no longer valid';
    isLocked.value = true;
    return;
  }

  try {
    const result = await sharingStore.acceptAccessLink(linkId, password.value);
    switch (result.status) {
      case 'accepted':
        emit('acceptAccessLinkComplete');
        break;
      case 'locked':
        error.value = LOCKED_MESSAGE;
        isLocked.value = true;
        break;
      case 'incorrect':
        error.value = INCORRECT_MESSAGE;
        attemptsHint.value = attemptsText(result.attemptsRemaining);
        break;
      default:
        error.value = INCORRECT_MESSAGE;
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
          :disabled="isLocked"
        />
      </label>
      <p class="prompt">Enter the password provided by the sender</p>

      <div
        v-if="error"
        class="error-message"
        data-testid="access-link-error"
        role="alert"
        style="color: red"
      >
        <p>{{ error }}</p>
        <p v-if="attemptsHint" data-testid="attempts-remaining">
          {{ attemptsHint }}
        </p>
      </div>
      <div>
        <BtnComponent
          data-testid="submit-button"
          primary
          size="medium"
          class="btn-primary"
          type="submit"
          :disabled="isLocked"
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
