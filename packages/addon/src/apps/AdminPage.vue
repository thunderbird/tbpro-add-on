<script setup lang="ts">
import ManagementPage from 'send-frontend/src/apps/send/ManagementPage.vue';
import logger from 'send-frontend/src/logger';
import { logger as sharedLogger } from 'tbpro-shared';
import { onMounted, ref } from 'vue';

const showManagement = ref(false);

onMounted(() => {
  // check that imports from send-frontend work
  logger.info('ManagementPage mounted logging frontend');
  // check that imports from tbpro-shared work
  sharedLogger.info('ManagementPage mounted logging shared');
});
</script>

<template>
  <h1>TB Pro</h1>
  <h2>Send</h2>
  <button @click="showManagement = !showManagement">
    {{ showManagement ? 'Hide' : 'Show' }} Management Page
  </button>
  <div v-if="showManagement">
    <ManagementPage />
  </div>
</template>
