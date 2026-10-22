<script setup lang="ts">
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import { ALL_UPLOADS_ABORTED } from '@send-frontend/lib/const';
import init from '@send-frontend/lib/init';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import useUserStore from '@send-frontend/stores/user-store';
import { onMounted } from 'vue';

import { useMetricsUpdate } from '@send-frontend/apps/common/mixins/metrics';
import useMetricsStore from '@send-frontend/stores/metrics';
import VersionTag from '@send-frontend/apps/common/VersionTag.vue';
import CompatibilityBanner from '../common/CompatibilityBanner.vue';
import CompatibilityBoundary from '../common/CompatibilityBoundary.vue';
import PopupView from './views/PopupView.vue';

const userStore = useUserStore();
const { keychain } = useKeychainStore();
const folderStore = useFolderStore();
const { initializeClientMetrics } = useMetricsStore();

onMounted(async () => {
  await init(userStore, keychain, folderStore);
  // Identify user for analytics
  const uid = userStore.user.uniqueHash;
  initializeClientMetrics(uid);
});

useMetricsUpdate();

// The update screen replaces the upload UI, so release Thunderbird's pending
// uploads instead of leaving them waiting for a popup that can't finish them.
async function abortPendingUploads() {
  try {
    await browser.runtime.sendMessage({
      type: ALL_UPLOADS_ABORTED,
      aborted: true,
    });
  } catch {
    // Not running as an extension, or no background listener.
  }
}
</script>

<template>
  <div id="send-page" class="container">
    <CompatibilityBoundary @blocked="abortPendingUploads">
      <CompatibilityBanner />
      <PopupView />
    </CompatibilityBoundary>
    <VersionTag />
  </div>
</template>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem 0;
}
p {
  color: #000;
  font-size: 13px;
  font-style: normal;
  font-weight: 400;
  line-height: normal;
}
</style>
