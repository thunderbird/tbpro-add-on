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
      <p class="font-bold">{{ activeText }}</p>
    </div>

    <div v-if="!error && !loadingSize">
      <ProgressBarDashboard :percentage="percentageUsed" />
    </div>
  </div>
</template>

<style lang="css" scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
</style>
