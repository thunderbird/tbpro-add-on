<script setup lang="ts">
import { useL10n } from '@send-frontend/l10n';
import FileUploadTemplate from '../FileUploadTemplate.vue';
import ProgressBar from '../ProgressBar.vue';

interface FileUploadStatus {
  name: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
}

interface Props {
  fileUploadStatuses: FileUploadStatus[];
}

defineProps<Props>();
const { t } = useL10n();
</script>

<template>
  <FileUploadTemplate
    :step="{
      stepNumber: 2,
      totalSteps: 2,
      title: t('send-upload-expiration-title'),
    }"
    :show-close-button="false"
  >
    <div class="upload-container">
      <ProgressBar />

      <!-- File upload status list -->
      <div v-if="fileUploadStatuses.length > 0" class="file-status-list">
        <div
          v-for="(file, index) in fileUploadStatuses"
          :key="index"
          class="file-status-item"
        >
          <span class="file-status-icon">
            <span v-if="file.status === 'pending'" class="status-pending"
              >⏳</span
            >
            <span v-if="file.status === 'uploading'" class="status-uploading"
              >📤</span
            >
            <span v-if="file.status === 'completed'" class="status-completed"
              >✅</span
            >
            <span v-if="file.status === 'error'" class="status-error">❌</span>
          </span>
          <span class="file-name">{{ file.name }}</span>
        </div>
      </div>
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

.file-status-list {
  width: 100%;
  max-width: 400px;
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.file-status-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--colour-surface-lower);
  border-radius: 6px;
  border: 1px solid var(--colour-surface-border);
}

.file-status-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.file-name {
  font-size: 0.875rem;
  color: var(--colour-ti-secondary);
  word-break: break-word;
  flex: 1;
}

.status-uploading {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
