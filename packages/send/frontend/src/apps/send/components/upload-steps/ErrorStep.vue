<script setup lang="ts">
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
      title: 'Select File Expiration',
    }"
    :show-close-button="true"
    :show-primary-button="true"
    primary-button-text="Try again"
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

      <h3 class="error-title">Upload failed</h3>

      <p class="error-description">
        We encountered an error while uploading your file. This could be due to
        network issues or file size limitations. Please check your connection
        and try again.
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
  color: #dc2626;
  margin-bottom: 1.5rem;
}

.error-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 1rem;
  text-align: center;
}

.error-description {
  color: #6b7280;
  font-size: 0.9375rem;
  line-height: 1.6;
  max-width: 400px;
  margin: 0 0 1.5rem;
  text-align: center;
}
</style>
