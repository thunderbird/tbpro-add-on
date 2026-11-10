<script setup lang="ts">
import { useL10n } from '@send-frontend/l10n';
import FileUploadTemplate from '../FileUploadTemplate.vue';

interface Props {
  shareUrl: string;
}

interface Emits {
  (e: 'close'): void;
  (e: 'copyToClipboard'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
const { t } = useL10n();

function handleClose() {
  emit('close');
}

function handleCopyToClipboard() {
  emit('copyToClipboard');
}
</script>

<template>
  <FileUploadTemplate
    :step="{
      stepNumber: 2,
      totalSteps: 2,
      title: t('send-upload-success-title'),
    }"
    :show-close-button="true"
    :show-primary-button="true"
    :primary-button-text="t('send-upload-button-close')"
    @close="handleClose"
    @primary="handleClose"
  >
    <div class="success-container">
      <div class="success-icon">
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
          <path d="M9 12l2 2 4-4"></path>
        </svg>
      </div>

      <h3 class="success-title">{{ t('send-upload-success-heading') }}</h3>

      <p class="success-description">
        {{ t('send-upload-success-description') }}
      </p>

      <div class="url-container">
        <input
          :value="shareUrl"
          readonly
          class="url-input"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <button class="copy-button" @click="handleCopyToClipboard">
          {{ t('send-upload-button-copy') }}
        </button>
      </div>
    </div>
  </FileUploadTemplate>
</template>

<style scoped>
.success-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 0;
  min-height: 200px;
}

.success-icon {
  color: var(--colour-ti-success);
  margin-bottom: 1.5rem;
}

.success-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--colour-ti-base);
  margin: 0 0 1rem;
  text-align: center;
}

.success-description {
  color: var(--colour-ti-muted);
  font-size: 0.9375rem;
  line-height: 1.6;
  max-width: 400px;
  margin: 0 0 1.5rem;
  text-align: center;
}

.url-container {
  width: 100%;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.url-input {
  flex: 1;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--colour-surface-border);
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--colour-ti-base);
  background: var(--colour-surface-lower);
}

.url-input:focus {
  outline: none;
  border-color: var(--colour-primary-default);
  box-shadow: 0 0 0 3px
    color-mix(in srgb, var(--colour-primary-default) 10%, transparent);
}

.copy-button {
  padding: 0.625rem 1.25rem;
  background: var(--colour-primary-default);
  color: var(--colour-ti-base-inverted);
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.copy-button:hover {
  background: var(--colour-primary-hover);
}

@media (max-width: 640px) {
  .url-container {
    flex-direction: column;
  }

  .copy-button {
    width: 100%;
  }
}
</style>
