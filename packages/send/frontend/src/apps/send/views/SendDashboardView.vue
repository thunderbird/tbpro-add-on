<script setup lang="ts">
import BackupAndRestore from '@send-frontend/apps/common/BackupAndRestore.vue';
import UserDashboard from '@send-frontend/apps/common/UserDashboard.vue';
import { useSendConfig } from '@send-frontend/composables/useSendConfig';
import { onMounted } from 'vue';

const { isTbproExtension } = defineProps<{
  isTbproExtension?: boolean;
}>();

const { useLoginQuery } = useSendConfig();

onMounted(() => {
  if (isTbproExtension) {
    useLoginQuery();
  }
});
</script>

<template>
  <router-view></router-view>
  <UserDashboard />
  <BackupAndRestore />
</template>
