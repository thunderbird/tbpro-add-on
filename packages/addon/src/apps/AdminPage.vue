<script setup lang="ts">
import SendManagement from 'send-frontend/src/apps/send/ManagementPage.vue';
import logger from 'send-frontend/src/logger';
import { logger as sharedLogger } from 'tbpro-shared';
import { onMounted } from 'vue';

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
  <SendManagement />
</template>
