<script setup lang="ts">
import BackupAndRestore from '@send-frontend/apps/common/BackupAndRestore.vue';
import UserDashboard from '@send-frontend/apps/common/UserDashboard.vue';
import { useSendConfig } from '@send-frontend/composables/useSendConfig';

const { useLoginQuery } = useSendConfig();

useLoginQuery();
</script>

<template>
  <router-view></router-view>
  <UserDashboard />
  <BackupAndRestore />
</template>
