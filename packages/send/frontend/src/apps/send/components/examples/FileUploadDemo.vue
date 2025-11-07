<script setup lang="ts">
import { ref } from 'vue';
import CreatePasswordStep from './CreatePasswordStep.vue';
import ErrorStep from './ErrorStep.vue';
import SelectExpirationStep from './SelectExpirationStep.vue';
import UploadingStep from './UploadingStep.vue';

type Step = 'password' | 'expiration' | 'uploading' | 'error';

const currentStep = ref<Step>('password');
const savedPassword = ref('');

function handlePasswordNext(password: string) {
  savedPassword.value = password;
  currentStep.value = 'expiration';
}

function handleBack() {
  currentStep.value = 'password';
}

function handleCreate() {
  currentStep.value = 'uploading';

  // Simulate upload completion or error
  setTimeout(() => {
    // Change to 'error' to see error state
    // currentStep.value = 'error';
    console.log('Upload complete!');
  }, 3000);
}

function handleRetry() {
  currentStep.value = 'uploading';

  setTimeout(() => {
    console.log('Retry complete!');
  }, 2000);
}

function handleClose() {
  console.log('Modal closed');
  // Reset to first step on close
  currentStep.value = 'password';
}
</script>

<template>
  <div class="demo-container">
    <!-- Step Navigation for Demo -->
    <div class="demo-controls">
      <h2>FileUploadTemplate Demo</h2>
      <div class="step-buttons">
        <button
          class="demo-button"
          :class="{ active: currentStep === 'password' }"
          @click="currentStep = 'password'"
        >
          1. Password
        </button>
        <button
          class="demo-button"
          :class="{ active: currentStep === 'expiration' }"
          @click="currentStep = 'expiration'"
        >
          2. Expiration
        </button>
        <button
          class="demo-button"
          :class="{ active: currentStep === 'uploading' }"
          @click="currentStep = 'uploading'"
        >
          3. Uploading
        </button>
        <button
          class="demo-button"
          :class="{ active: currentStep === 'error' }"
          @click="currentStep = 'error'"
        >
          4. Error
        </button>
      </div>
    </div>

    <!-- Modal Steps -->
    <CreatePasswordStep
      v-if="currentStep === 'password'"
      @next="handlePasswordNext"
      @close="handleClose"
    />

    <SelectExpirationStep
      v-if="currentStep === 'expiration'"
      @back="handleBack"
      @create="handleCreate"
      @close="handleClose"
    />

    <UploadingStep v-if="currentStep === 'uploading'" @close="handleClose" />

    <ErrorStep
      v-if="currentStep === 'error'"
      @retry="handleRetry"
      @close="handleClose"
    />
  </div>
</template>

<style scoped>
.demo-container {
  min-height: 100vh;
  background: #f3f4f6;
  padding: 2rem;
}

.demo-controls {
  max-width: 800px;
  margin: 0 auto 2rem;
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.demo-controls h2 {
  margin: 0 0 1rem;
  font-size: 1.25rem;
  color: #111827;
}

.step-buttons {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.demo-button {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  transition: all 0.2s ease;
}

.demo-button:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.demo-button.active {
  background: #0060df;
  border-color: #0060df;
  color: white;
}
</style>
