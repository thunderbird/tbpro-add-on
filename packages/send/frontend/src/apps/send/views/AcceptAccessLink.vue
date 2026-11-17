<script setup lang="ts">
import useSharingStore from '@send-frontend/apps/send/stores/sharing-store';
import { useL10n } from '@send-frontend/l10n';
import { onMounted, ref } from 'vue';

import { getCanRetry } from '@send-frontend/lib/validations';
import { useRoute } from 'vue-router';
import BtnComponent from '../elements/BtnComponent.vue';
import DownloadTemplate from './DownloadTemplate.vue';

const emit = defineEmits(['acceptAccessLinkComplete']);
const { t } = useL10n();

const password = ref('');
const error = ref('');
const attemptsHint = ref('');
const passwordInput = ref<HTMLInputElement | null>(null);
const isLocked = ref(false);

const route = useRoute();

const sharingStore = useSharingStore();

function attemptsText(attemptsRemaining?: number) {
  if (!attemptsRemaining) return '';
  return t('send-access-attempts-remaining', { count: attemptsRemaining });
}

async function accept() {
  if (isLocked.value) return;
  error.value = ''; // Clear previous errors
  attemptsHint.value = '';
  const linkId = route.params.linkId as string;
  const isValid = await sharingStore.isAccessLinkValid(linkId);
  const canRetry = await getCanRetry(linkId);

  if (!isValid || !canRetry) {
    error.value = t('send-access-error-invalid');
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
        error.value = t('send-access-error-locked');
        isLocked.value = true;
        break;
      case 'incorrect':
        error.value = t('send-access-error-incorrect');
        attemptsHint.value = attemptsText(result.attemptsRemaining);
        break;
      default:
        error.value = t('send-access-error-incorrect');
    }
  } catch (e) {
    console.error(e);
    error.value = t('send-access-error-generic');
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
    <h3>{{ t('send-access-title') }}</h3>
    <form class="flex gap-2 flex-col" @submit.prevent="accept">
      <label class="">
        <div class="flex gap-1">
          <p class="passwordText">{{ t('send-access-password-label') }}</p>
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
      <p class="prompt">{{ t('send-access-password-prompt') }}</p>

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
          >{{ t('send-access-button-continue') }}</BtnComponent
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
  color: var(--colour-ti-muted);
  font-size: 11px;
}
.critical {
  color: var(--colour-ti-critical);
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
  border: solid 1px var(--colour-surface-border);
  background-color: var(--colour-surface-base);
  width: 100%;
  max-width: 38rem;
}
.passwordText {
  font-size: 14px;
  font-weight: 600;
  color: var(--colour-ti-secondary);
}
</style>
