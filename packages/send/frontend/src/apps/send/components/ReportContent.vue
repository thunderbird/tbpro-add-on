<script setup lang="ts">
import useApiStore from '@send-frontend/stores/api-store';
import useMetricsStore from '@send-frontend/stores/metrics';
import { ref } from 'vue';
import { FolderResponse } from '../stores/folder-store.types';

type ReportProps = {
  uploadId: string;
  containerId: FolderResponse['id'];
};

const { api } = useApiStore();
const { metrics } = useMetricsStore();

const hasClicked = ref(false);
const hasReported = ref(false);

async function reportContent({ uploadId, containerId }: ReportProps) {
  console.log('reporting content', { uploadId, containerId });
  await api.call(`containers/${containerId}/report`, { uploadId }, 'POST');
  metrics.capture('report_content_confirm', { uploadId, containerId });

  hasReported.value = true;
  setTimeout(() => {
    location.reload();
  }, 2000);
}

function handleClickReport({ uploadId, containerId }: ReportProps) {
  metrics.capture('report_content_attempt', { uploadId, containerId });
  hasClicked.value = true;
}

async function markAsSuspicious({ uploadId }: ReportProps) {
  metrics.capture('report_suspicious_content');
  await api.call('uploads/report', { uploadId }, 'POST');
  hasReported.value = true;
  setTimeout(() => {
    location.reload();
  }, 2000);
}
defineProps<ReportProps>();
</script>

<template>
  <div class="report-section">
    <div v-if="hasReported" class="report-message">
      <p>Thank you for your report!</p>
    </div>
    <div v-else>
      <div v-if="!hasClicked" class="report-content">
        <p class="report-text">
          Is this content harmful?
          <a
            class="link"
            @click.prevent="handleClickReport({ uploadId, containerId })"
          >
            Report it</a
          ><span class="transparent">transparent text</span>
        </p>
      </div>
      <div v-else class="report-content">
        <p class="report-text">
          Please confirm your report
          <a
            class="link"
            @click.prevent="reportContent({ uploadId, containerId })"
          >
            here</a
          >
          <!--This is a temporary pre-MVP way for us to test suspicious files  -->
          <span
            class="link transparent"
            @click.prevent="markAsSuspicious({ uploadId, containerId })"
          >
            transparent text</span
          >
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.report-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e5e5;
}

.report-message {
  color: #333;
  font-size: 0.9375rem;
}

.report-message p {
  margin: 0;
}

.report-content {
  display: flex;
}

.report-text {
  color: #666;
  font-size: 0.9375rem;
  margin: 0;
}

.link {
  color: #0066cc;
  text-decoration: none;
  cursor: pointer;
}

.link:hover {
  text-decoration: underline;
}

.transparent {
  color: transparent;
}
</style>
