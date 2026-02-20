<script setup lang="ts">
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';

import FileInfo from '@send-frontend/apps/send/components/FileInfo.vue';
import FolderInfo from '@send-frontend/apps/send/components/FolderInfo.vue';
import FolderNavigation from '@send-frontend/apps/send/components/FolderNavigation.vue';
import { useUserStore } from '@send-frontend/stores';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import NewFolder from '../components/NewFolder.vue';

const { user } = useUserStore();
const folderStore = useFolderStore();
const { currentRoute } = useRouter();

const showFileComponents = computed(() => {
  return currentRoute.value.path.includes('/folder');
});
</script>

<template>
  <div id="send-page" class="flex h-full relative">
    <!-- Router Loading Overlay -->

    <aside
      v-if="showFileComponents"
      class="w-64 border-r border-gray-300 bg-gray-50"
    >
      <FolderNavigation />
    </aside>

    <main class="flex flex-col gap-4 grow">
      <header
        v-if="showFileComponents"
        class="w-full sticky top-0 flex items-center justify-between px-4 py-2 bg-white/90 border-b border-gray-300"
      >
        <span>{{ user.thundermailEmail }}</span>
        <NewFolder />
      </header>
      <div class="flex flex-col gap-4 px-4 content-layout">
        <router-view></router-view>
      </div>
    </main>

    <aside
      v-if="showFileComponents"
      class="w-64 border border-gray-300 bg-gray-50 p-2.5"
    >
      <FileInfo v-if="folderStore.selectedFile" />
      <FolderInfo v-if="folderStore.selectedFolder" />
    </aside>
  </div>
</template>
