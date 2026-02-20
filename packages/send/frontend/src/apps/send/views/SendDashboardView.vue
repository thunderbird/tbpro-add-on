<script setup lang="ts">
import { useSendConfig } from '@send-frontend/composables/useSendConfig';
import { onMounted } from 'vue';
import SendAddonDashboard from './SendAddonDashboard.vue';

/**
 * TB Pro Add-On Dashboard View
 * This page only renders inside the addon
 */

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
  <SendAddonDashboard />
</template>
