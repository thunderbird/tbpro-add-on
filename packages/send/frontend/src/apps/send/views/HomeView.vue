<script setup lang="ts">
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';

import FileInfo from '@send-frontend/apps/send/components/FileInfo.vue';
import FolderInfo from '@send-frontend/apps/send/components/FolderInfo.vue';
import FolderNavigation from '@send-frontend/apps/send/components/FolderNavigation.vue';
import { useUserStore } from '@send-frontend/stores';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
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

// Matches Tailwind's `md` breakpoint (768px); below it the upload sidebar is a
// bottom-docked bar instead of an inline column (see #977).
const isMobile = useMediaQuery('(max-width: 767.98px)');

// How far the bottom-docked upload sidebar is lifted off the bottom of the
// viewport. It stays at 0 (flush to the bottom) until the footer scrolls into
// view, then rides up by exactly the footer's visible height so it sits just
// above the footer instead of overlapping it.
const footerOffset = ref(0);

let footerObserver: IntersectionObserver | null = null;
let footerEl: HTMLElement | null = null;

function updateFooterOffset() {
  if (!footerEl) {
    footerOffset.value = 0;
    return;
  }
  const rect = footerEl.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  // Portion of the footer currently visible from the bottom of the viewport.
  const visible = Math.max(0, viewportHeight - Math.max(rect.top, 0));
  footerOffset.value = Math.min(visible, rect.height);
}

function teardownFooterWatch() {
  if (footerObserver) {
    footerObserver.disconnect();
    footerObserver = null;
  }
  window.removeEventListener('scroll', updateFooterOffset);
  window.removeEventListener('resize', updateFooterOffset);
  footerEl = null;
  footerOffset.value = 0;
}

function setupFooterWatch() {
  teardownFooterWatch();
  footerEl = document.getElementById('send-footer');
  if (!footerEl) return;

  // Recompute the offset continuously while the footer is intersecting the
  // viewport; the IntersectionObserver just gates the (cheap) scroll listener.
  footerObserver = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        window.addEventListener('scroll', updateFooterOffset, { passive: true });
        window.addEventListener('resize', updateFooterOffset);
        updateFooterOffset();
      } else {
        window.removeEventListener('scroll', updateFooterOffset);
        window.removeEventListener('resize', updateFooterOffset);
        footerOffset.value = 0;
      }
    },
    { threshold: [0, 0.01] }
  );
  footerObserver.observe(footerEl);
  updateFooterOffset();
}

// Only run the footer-tracking machinery while the mobile upload bar is
// actually on screen (mobile viewport + inside a folder).
const uploadDocked = computed(
  () => isMobile.value && showFileComponents.value
);

watch(
  uploadDocked,
  (active) => {
    if (active) {
      // Defer to next frame so the footer element is present in the DOM.
      requestAnimationFrame(setupFooterWatch);
    } else {
      teardownFooterWatch();
    }
  },
  { immediate: true }
);

onBeforeUnmount(teardownFooterWatch);
</script>

<template>
  <div id="send-page" class="flex max-md:flex-col h-full relative">
    <!-- Router Loading Overlay -->

    <!--
      Upload sidebar. On desktop (md+) it's the original left-hand w-64 column.
      Below md it becomes a bottom-docked bar (fixed to the bottom of the
      viewport, full width) so the file list gets the whole screen instead of
      sharing it with a cramped side column (see #977). While the footer is
      off-screen the bar sits flush to the bottom; once the footer scrolls into
      view an IntersectionObserver lifts the bar by the footer's visible height
      (footerOffset) so it parks just above the footer instead of overlapping
      it. The `max-md:`-scoped classes leave desktop untouched.
    -->
    <aside
      v-if="showFileComponents"
      class="w-64 border-r border-gray-300 bg-gray-50 max-md:fixed max-md:inset-x-0 max-md:z-[1000] max-md:w-full max-md:border-r-0 max-md:border-t max-md:shadow-[0_-4px_12px_rgba(0,0,0,0.12)] max-md:transition-[bottom] max-md:duration-150"
      :style="isMobile ? { bottom: `${footerOffset}px` } : undefined"
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
      `max-md:`-scoped; the only desktop change is that the panel now hides when
      nothing is selected (previously it rendered an empty bordered column).
    -->
    <aside
      v-if="showFileComponents && hasSelection"
      class="w-64 border border-gray-300 bg-gray-50 p-2.5 max-md:fixed max-md:inset-0 max-md:z-[1001] max-md:w-full max-md:overflow-y-auto max-md:overflow-x-hidden max-md:border-0"
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
