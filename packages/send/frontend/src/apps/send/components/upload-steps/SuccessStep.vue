<script setup lang="ts">
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
      title: 'Link Created Successfully',
    }"
    :show-close-button="true"
    :show-primary-button="true"
    primary-button-text="Close"
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

      <h3 class="success-title">Your file has been uploaded!</h3>

      <p class="success-description">
        Share this link with your recipient. They will need the password to
        access the file.
      </p>

      <div class="url-container">
        <input
          :value="shareUrl"
          readonly
          class="url-input"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <button class="copy-button" @click="handleCopyToClipboard">Copy</button>
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
  color: #10b981;
  margin-bottom: 1.5rem;
}

.success-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 1rem;
  text-align: center;
}

.success-description {
  color: #6b7280;
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
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #111827;
  background: #f9fafb;
}

.url-input:focus {
  outline: none;
  border-color: #0060df;
  box-shadow: 0 0 0 3px rgba(0, 96, 223, 0.1);
}

.copy-button {
  padding: 0.625rem 1.25rem;
  background: #0060df;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.copy-button:hover {
  background: #0050c8;
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
