<script setup lang="ts">
import { ref } from 'vue';
import FileUploadTemplate from '../FileUploadTemplate.vue';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const uploadProgress = ref(60);
</script>

<template>
  <FileUploadTemplate
    :step="{
      stepNumber: 2,
      totalSteps: 2,
      title: 'Select File Expiration',
    }"
    :show-close-button="true"
    @close="emit('close')"
  >
    <!-- Upload Status -->
    <div class="upload-container">
      <div class="upload-status">
        <span class="status-label">UPLOAD STATUS</span>
        <span class="status-percentage">{{ uploadProgress }}%</span>
      </div>

      <!-- Progress Bar -->
      <div class="progress-bar-container">
        <div class="progress-bar-bg">
          <div
            class="progress-bar-fill"
            :style="{ width: `${uploadProgress}%` }"
          ></div>
        </div>
      </div>

      <p class="upload-message">Uploading your file...</p>
    </div>
  </FileUploadTemplate>
</template>

<style scoped>
.upload-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 0;
  min-height: 200px;
}

.upload-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  margin-bottom: 1rem;
}

.status-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  letter-spacing: 0.05em;
}

.status-percentage {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0060df;
}

.progress-bar-container {
  width: 100%;
  margin-bottom: 1.5rem;
}

.progress-bar-bg {
  width: 100%;
  height: 8px;
  background-color: #e5e7eb;
  border-radius: 9999px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background-color: #0060df;
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.upload-message {
  color: #6b7280;
  font-size: 0.9375rem;
  margin: 0;
}
</style>
