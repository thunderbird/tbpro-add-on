<script setup lang="ts">
import useFolderStore from '@/apps/send/stores/folder-store';
import useUserStore from '@/stores/user-store';

import FeedbackBox from '@/apps/common/FeedbackBox.vue';
import FileInfo from '@/apps/send/components/FileInfo.vue';
import FolderInfo from '@/apps/send/components/FolderInfo.vue';
import FolderNavigation from '@/apps/send/components/FolderNavigation.vue';
import NewFolder from '@/apps/send/components/NewFolder.vue';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const { user } = useUserStore();
const folderStore = useFolderStore();
const { currentRoute } = useRouter();

const showFileComponents = computed(() => {
  return currentRoute.value.path.includes('/folder');
});
</script>

<template>
  <div id="send-page" class="flex min-h-screen">
    <aside class="w-64 border-r border-gray-300 bg-gray-50">
      <FolderNavigation />
    </aside>

    <main class="flex flex-col gap-4 grow">
      <header
        class="w-full sticky top-0 flex items-center justify-between px-4 py-2 bg-white/90 border-b border-gray-300"
      >
        <h1>{{ user.email }}</h1>
        <NewFolder />
      </header>

      <div class="flex flex-col gap-4 px-4">
        <router-view></router-view>
      </div>
      <FeedbackBox />
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
