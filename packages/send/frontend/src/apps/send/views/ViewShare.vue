<script setup lang="ts">
import FolderTree from '@send-frontend/apps/send/components/FolderTree.vue';
import useSharingStore from '@send-frontend/apps/send/stores/sharing-store';
import { organizeFiles } from '@send-frontend/lib/folderView';
import logger from '@send-frontend/logger';
import { Container } from '@send-frontend/types';
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import DownloadTemplate from './DownloadTemplate.vue';

const route = useRoute();
const sharingStore = useSharingStore();

const folder = ref<Container>(null);
const containerId = ref(null);

onMounted(async () => {
  logger.info(`ViewShare ready to get folder for hash`);
  // Using route.params.linkId, get the folder contents
  const container = await sharingStore.getSharedFolder(
    route.params.linkId as string
  );
  folder.value = { ...container, items: organizeFiles(container.items) };
  containerId.value = container.id;
});
</script>
<template>
  <div v-if="folder?.id">
    <DownloadTemplate>
      <FolderTree :folder="folder" :container-id="containerId" />
    </DownloadTemplate>
  </div>
</template>
