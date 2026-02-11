<script setup lang="ts">
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';

import Btn from '@send-frontend/apps/send/elements/BtnComponent.vue';
import { useConfigStore, useStatusStore } from '@send-frontend/stores';
import { IconPlus } from '@tabler/icons-vue';
import { useMutation } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const folderStore = useFolderStore();
const statusStore = useStatusStore();
const { isRouterLoading } = storeToRefs(statusStore);
const { isProd } = useConfigStore();
const route = useRoute();

const { mutateAsync } = useMutation({
  mutationFn: async () => {
    await folderStore.createFolder();
  },
  retry: 3,
  onError: (error: unknown) => {
    console.error('Error creating folder:', error);
  },
});

const isInProfileView = computed(() => {
  // Check if we're not in the profile view
  return route.path.includes('profile');
});

const shouldShowButton = computed(() => {
  return (
    !isRouterLoading &&
    isInProfileView &&
    // We're hiding the folder creation button temporaily
    // https://github.com/thunderbird/tbpro-add-on/issues/479
    !isProd
  );
});
</script>

<template>
  <!-- To avoid layout shifts, this placeholder shows when it's loading -->
  <span v-if="isRouterLoading" style="height: 39px"></span>
  <!-- Only show button outside of profile page -->
  <div v-if="shouldShowButton">
    <Btn primary data-testid="new-folder-button" @click="mutateAsync">
      <IconPlus class="w-5 h-5 stroke-2" />
      New Folder
    </Btn>
  </div>
</template>
