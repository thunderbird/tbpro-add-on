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
    class="folder-navigation"
    role="complementary"
    aria-label="File management sidebar"
  >
    <!-- actions -->
    <header class="actions-header">
      <h2 class="sr-only">File Management Actions</h2>
    </header>
    <!-- upload zone -->
    <RenderOnEnvironment :environment-type="['WEB APP OUTSIDE THUNDERBIRD']">
      <section class="upload-section" aria-labelledby="upload-heading">
        <h3 id="upload-heading" class="sr-only">Upload Files</h3>
        <DragAndDropUpload v-if="showUploadZone">
          <div
            class="upload-zone"
            role="button"
            tabindex="0"
            aria-label="Drag and drop files here to upload, or click to select files"
            @keydown="handleUploadKeydown"
          >
            Drop files here<br />
            or tap to upload
          </div>
        </DragAndDropUpload>
      </section>
    </RenderOnEnvironment>
  </aside>
</template>

<style scoped>
.folder-navigation {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  height: 100%;
}

.actions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-block-start: 0.5rem;
  padding-inline: 0.625rem;
}

.upload-section {
  padding-inline: 0.625rem;
}

.upload-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 9rem;
  text-align: center;
  font-size: 1.125rem;
  line-height: 1.75rem;
  font-weight: 700;
  color: rgb(107, 114, 128);
  border: 4px dashed rgb(209, 213, 219);
  border-radius: 0.5rem;
}

/*
  Below md the parent aside (HomeView) turns this into a bottom-docked bar, so
  the column gap just adds dead space — drop it and pad the bar instead.
  Scoped CSS can't read a TS constant, so this bound is a hand-kept copy of
  MOBILE_MEDIA_QUERY in composables/useIsMobile.ts (and of Tailwind's
  `max-md:`); change all three together.
*/
@media (max-width: 767.98px) {
  .folder-navigation {
    gap: 0;
    padding: 1rem;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
