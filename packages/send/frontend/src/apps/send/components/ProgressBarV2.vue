<script setup lang="ts">
import DocumentIcon from '@send-frontend/apps/common/DocumentIcon.vue';
import ImageIcon from '@send-frontend/apps/common/ImageIcon.vue';
import { useL10n } from '@send-frontend/l10n';
import prettyBytes from 'pretty-bytes';
import { computed, onUnmounted } from 'vue';
import { useStatusStore, type ProcessStage } from '../stores/status-store';

const { progress } = useStatusStore();
const { t } = useL10n();

onUnmounted(() => {
  progress.initialize();
});

// Compute stage display text and colors
const stageInfo = computed(() => {
  const stage = progress.processStage;

  const stageMap: Record<
    ProcessStage,
    { text: string; color: string; bgColor: string }
  > = {
    idle: {
      text: t('send-progress-stage-idle'),
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
    },
    hashing: {
      text: t('send-progress-stage-hashing'),
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
    },
    preparing: {
      text: t('send-progress-stage-preparing'),
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    encrypting: {
      text: t('send-progress-stage-encrypting'),
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
    uploading: {
      text: t('send-progress-stage-uploading'),
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    downloading: {
      text: t('send-progress-stage-downloading'),
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    decrypting: {
      text: t('send-progress-stage-decrypting'),
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    processing: {
      text: t('send-progress-stage-processing'),
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100',
    },
    completed: {
      text: t('send-progress-stage-completed'),
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    error: {
      text: t('send-progress-stage-error'),
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
  };

  return stageMap[stage] || stageMap.idle;
});

// Determine file icon based on filename extension
const fileIcon = computed(() => {
  if (!progress.fileName) return 'document';

  const extension = progress.fileName.split('.').pop()?.toLowerCase() || '';
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];

  return imageExtensions.includes(extension) ? 'image' : 'document';
});

// Format progress display
const progressDisplay = computed(() => {
  if (progress.total === 0) return '';
  return `${prettyBytes(progress.progressed)} / ${prettyBytes(progress.total)}`;
});
</script>

<template>
  <div
    v-if="progress.fileName || progress.processStage !== 'idle'"
    class="w-full"
    role="status"
    aria-live="polite"
    :aria-label="
      t('send-progress-status-label', {
        fileName: progress.fileName,
        stage: stageInfo.text,
        percent: progress.percentage,
      })
    "
  >
    <!-- File Info Section -->
    <div
      class="flex items-center justify-between p-3 bg-gray-100 rounded-lg border w-full mb-3"
    >
      <div class="flex items-center space-x-3 flex-1 min-w-0">
        <div class="flex-shrink-0">
          <!-- File icon based on type -->
          <ImageIcon v-if="fileIcon === 'image'" />
          <DocumentIcon v-else />
        </div>
        <div class="flex-1 min-w-0 overflow-hidden">
          <p
            class="text-sm font-medium text-gray-900 truncate"
            :title="progress.fileName"
          >
            {{ progress.fileName || t('send-progress-file-pending') }}
          </p>
          <div class="flex flex-col text-sm text-gray-500">
            <span v-if="progressDisplay" class="truncate">
              {{ progressDisplay }}
            </span>
            <span
              class="px-2 py-1 rounded-full text-xs font-medium w-fit"
              :class="[stageInfo.color, stageInfo.bgColor]"
            >
              {{ stageInfo.text }}
            </span>
          </div>
        </div>
      </div>
      <div class="flex-shrink-0 ml-2 text-right">
        <div class="text-lg font-semibold text-gray-900">
          {{ progress.percentage }}%
        </div>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="w-full">
      <div class="progress-bar-container">
        <div
          class="progress-bar"
          :style="{ width: progress.percentage + '%' }"
          :class="{
            'bg-blue-500':
              progress.processStage === 'uploading' ||
              progress.processStage === 'preparing',
            'bg-orange-500': progress.processStage === 'encrypting',
            'bg-green-500':
              progress.processStage === 'downloading' ||
              progress.processStage === 'completed',
            'bg-purple-500': progress.processStage === 'decrypting',
            'bg-indigo-500': progress.processStage === 'processing',
            'bg-red-500': progress.processStage === 'error',
            'bg-gray-400':
              progress.processStage === 'idle' ||
              progress.processStage === 'hashing',
          }"
        ></div>
      </div>
    </div>

    <!-- Error Display -->
    <div
      v-if="progress.error"
      class="mt-2 p-2 bg-red-50 border border-red-200 rounded-md"
      role="alert"
      aria-live="assertive"
    >
      <p class="text-sm text-red-600">
        {{ progress.error }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.progress-bar-container {
  width: 100%;
  height: 8px;
  background-color: var(--colour-surface-deep);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
}

.progress-bar {
  height: 100%;
  transition:
    width 0.3s ease,
    background-color 0.2s ease;
  border-radius: 4px;
}

/* Accessibility improvements */
@media (prefers-reduced-motion: reduce) {
  .progress-bar {
    transition: none;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .progress-bar-container {
    border: 1px solid;
  }
}
</style>
