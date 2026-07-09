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

const hasSelection = computed(() => {
  return Boolean(folderStore.selectedFile || folderStore.selectedFolder);
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
      <div class="flex flex-col gap-4 px-4 content-layout page-wrapper">
        <router-view></router-view>
      </div>
    </main>

    <!--
      Info panel. On desktop (md+) this is the original inline w-64 column. Below
      md it becomes a full-screen overlay (z-[1000], above the app nav which is
      z-999) with its own close control, so it no longer covers the file list's
      action buttons or traps the user (see #977). The overlay classes are
      `max-md:`-scoped so the desktop layout is byte-for-byte the original.
    -->
    <aside
      v-if="showFileComponents && hasSelection"
      class="w-64 border border-gray-300 bg-gray-50 p-2.5 max-md:fixed max-md:inset-0 max-md:z-[1000] max-md:w-full max-md:overflow-y-auto max-md:border-0"
    >
      <FileInfo v-if="folderStore.selectedFile" />
      <FolderInfo v-if="folderStore.selectedFolder" />
    </aside>
  </div>
</template>

<style lang="css" scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
.page-wrapper {
  margin: 0 auto;
  max-width: 1200px;
}
</style>
