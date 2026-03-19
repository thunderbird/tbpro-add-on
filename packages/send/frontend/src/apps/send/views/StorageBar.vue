<script lang="ts" setup>
import LoadingComponent from '@send-frontend/apps/common/LoadingComponent.vue';
import { trpc } from '@send-frontend/lib/trpc';
import { useQuery } from '@tanstack/vue-query';
import prettyBytes from 'pretty-bytes';
import { computed } from 'vue';
import ProgressBarDashboard from '../components/ProgressBarDashboard.vue';

const {
  data: size,
  error,
  isLoading: loadingSize,
} = useQuery({
  queryKey: ['getTotalSize'],
  queryFn: async () => {
    return trpc.getTotalUsedStorage.query();
  },
});

const activeText = computed(() => {
  const activeText = prettyBytes(size.value.active);
  const limitText = prettyBytes(size.value.limit);

  return `${activeText} of ${limitText}`;
});

const percentageUsed = computed(() => {
  return (size.value.active * 100) / size.value.limit;
});

const isLoading = computed(() => {
  return loadingSize.value;
});
</script>

<template>
  <p v-if="error">{{ error.message }}</p>

  <LoadingComponent v-if="isLoading" />

  <div v-if="!isLoading">
    <div class="row">
      <h3 class="send-storage">Send Storage</h3>
      <p class="storage-remaining">{{ activeText }}</p>
    </div>

    <div v-if="!error && !loadingSize">
      <ProgressBarDashboard :percentage="percentageUsed" />
    </div>
  </div>
</template>

<style lang="css" scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
.send-storage {
  font-family: Metropolis;
  font-size: 20px;
  font-weight: 500;
  font-stretch: normal;
  font-style: normal;
  line-height: 1.2;
  letter-spacing: normal;
  text-align: left;
  color: #4c4d58;
}

.storage-remaining {
  font-family: Inter;
  font-size: 16px;
  font-weight: 600;
  font-stretch: normal;
  font-style: normal;
  line-height: normal;
  letter-spacing: normal;
  text-align: right;
  color: #4c4d58;
}
</style>
