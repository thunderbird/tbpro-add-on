<script setup lang="ts">
import { useL10n } from '@send-frontend/l10n';
import FileUploadTemplate from '../FileUploadTemplate.vue';

interface Props {
  uploadError: string;
}

interface Emits {
  (e: 'close'): void;
  (e: 'retry'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useL10n();

function handleClose() {
  emit('close');
}

function handleRetry() {
  emit('retry');
}
</script>

<template>
  <FileUploadTemplate
    :step="{
      stepNumber: 2,
      totalSteps: 2,
      title: t('send-upload-expiration-title'),
    }"
    :show-close-button="true"
    :show-primary-button="true"
    :primary-button-text="t('send-upload-button-try-again')"
    :error-message="uploadError"
    @close="handleClose"
    @primary="handleRetry"
  >
    <div class="error-container">
      <div class="error-icon">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>

      <h3 class="error-title">{{ t('send-upload-failed-title') }}</h3>

      <p class="error-description">
        {{ t('send-upload-failed-description') }}
      </p>
    </div>
  </FileUploadTemplate>
</template>

<style scoped>
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 0;
  min-height: 200px;
}

.error-icon {
  color: var(--colour-ti-critical);
  margin-bottom: 1.5rem;
}

.error-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--colour-ti-base);
  margin: 0 0 1rem;
  text-align: center;
}

.error-description {
  color: var(--colour-ti-muted);
  font-size: 0.9375rem;
  line-height: 1.6;
  max-width: 400px;
  margin: 0 0 1.5rem;
  text-align: center;
}
</style>
