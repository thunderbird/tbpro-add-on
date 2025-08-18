<script setup lang="ts">
import { useConfigStore } from '@send-frontend/stores';
import { IconAlertCircleFilled } from '@tabler/icons-vue';
const { isExtension } = useConfigStore();
</script>

<template>
  <!-- We return an empty render whenever the extension finds 404 routes -->
  <div v-if="!isExtension" class="gap-2">
    <div class="flex items-center text-4xl text-orange-500 gap-2">
      <div class="flex justify-center items-center">
        <IconAlertCircleFilled />
      </div>
      <h1>404</h1>
    </div>
    <div><p class="text-2xl">Page not found</p></div>
  </div>
</template>
