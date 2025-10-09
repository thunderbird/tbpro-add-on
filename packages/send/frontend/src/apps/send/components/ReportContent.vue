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
  <div v-if="hasReported">
    <p>Thank you for your report!</p>
  </div>
  <div v-else>
    <div v-if="!hasClicked" class="report">
      <p>
        Is this content harmful?
        <span
          class="clickable"
          @click.prevent="handleClickReport({ uploadId, containerId })"
        >
          Report it</span
        ><span class="transparent">transparent text</span>
      </p>
    </div>
    <div v-else class="report">
      <p>
        Please confirm your report
        <span
          class="clickable"
          @click.prevent="reportContent({ uploadId, containerId })"
          >here</span
        ><span
          class="clickable transparent"
          @click.prevent="markAsSuspicious({ uploadId, containerId })"
          >transparent text</span
        >
      </p>
    </div>
  </div>
</template>

<style scoped>
.report {
  display: flex;
}
.clickable {
  cursor: pointer;
  color: blue;
}
.transparent {
  color: transparent;
}
</style>
