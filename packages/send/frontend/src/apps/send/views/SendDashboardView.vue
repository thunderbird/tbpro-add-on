<script setup lang="ts">
import BackupAndRestore from '@send-frontend/apps/common/BackupAndRestore.vue';
import UserDashboard from '@send-frontend/apps/common/UserDashboard.vue';
import { useExtensionStore } from '@send-frontend/stores';
import { logger } from 'tbpro-shared';
import { onMounted } from 'vue';

const { configureExtension } = useExtensionStore();

onMounted(() => {
  logger.info('Configuring extension for send');
  configureExtension();
});
</script>

<template>
  <UserDashboard />
  <BackupAndRestore />
</template>
