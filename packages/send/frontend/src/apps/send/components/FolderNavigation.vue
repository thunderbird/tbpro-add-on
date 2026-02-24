<script setup lang="ts">
import RenderOnEnvironment from '@send-frontend/apps/common/RenderOnEnvironment.vue';
import DragAndDropUpload from '@send-frontend/apps/send/components/DragAndDropUpload.vue';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const { currentRoute } = useRouter();

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
  </aside>
</template>
