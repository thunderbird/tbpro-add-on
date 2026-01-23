<script setup lang="ts">
import RenderOnEnvironment from '@send-frontend/apps/common/RenderOnEnvironment.vue';
import DragAndDropUpload from '@send-frontend/apps/send/components/DragAndDropUpload.vue';
import { useFolderStore } from '@send-frontend/stores';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const { currentRoute } = useRouter();
const { rootFolderId } = useFolderStore();
const rootFolderIdValue = computed(() =>
  rootFolderId ? `/send/folder/${rootFolderId}` : '/send'
);

const showUploadZone = computed(() => {
  return currentRoute.value.path.includes('/folder');
});

const handleUploadKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    (event.target as HTMLElement).click();
  }
};
</script>

<template>
  <aside
    class="flex flex-col gap-6 h-full"
    role="complementary"
    aria-label="File management sidebar"
  >
    <!-- actions -->
    <header class="flex items-center justify-between pt-2 px-2.5">
      <h2 class="sr-only">File Management Actions</h2>
    </header>
    <!-- upload zone -->
    <RenderOnEnvironment :environment-type="['WEB APP OUTSIDE THUNDERBIRD']">
      <section class="px-2.5" aria-labelledby="upload-heading">
        <h3 id="upload-heading" class="sr-only">Upload Files</h3>
        <DragAndDropUpload v-if="showUploadZone">
          <div
            class="h-36 flex justify-center items-center text-center font-bold text-lg text-gray-500 border-4 border-dashed border-gray-300 rounded-lg"
            role="button"
            tabindex="0"
            aria-label="Drag and drop files here to upload, or click to select files"
            @keydown="handleUploadKeydown"
          >
            Drag &amp; Drop<br />
            files here to upload
          </div>
        </DragAndDropUpload>
      </section>
    </RenderOnEnvironment>
    <!-- navigation -->
    <nav class="flex flex-col gap-2 p-2.5" aria-labelledby="nav-heading">
      <h3 id="nav-heading" class="sr-only">Navigation</h3>
      <ul role="list">
        <li data-tesid="my-files-link">
          <router-link
            :to="rootFolderIdValue"
            class="block py-2 px-3 rounded hover:bg-gray-100 focus:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            aria-describedby="my-files-desc"
          >
            My Files
            <span id="my-files-desc" class="sr-only"
              >Navigate to your uploaded files</span
            >
          </router-link>
        </li>
        <li data-tesid="profile-link">
          <router-link
            to="/send/profile"
            class="block py-2 px-3 rounded hover:bg-gray-100 focus:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            aria-describedby="profile-desc"
          >
            Profile
            <span id="profile-desc" class="sr-only"
              >View and edit your profile settings</span
            >
          </router-link>
        </li>
      </ul>
    </nav>
  </aside>
</template>
