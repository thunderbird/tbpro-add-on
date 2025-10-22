<script setup lang="ts">
import FeedbackBox from '@send-frontend/apps/common/FeedbackBox.vue';
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import init from '@send-frontend/lib/init';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import useUserStore from '@send-frontend/stores/user-store';
import { onMounted } from 'vue';

import { useMetricsUpdate } from '@send-frontend/apps/common/mixins/metrics';
import useMetricsStore from '@send-frontend/stores/metrics';
import { ModalsContainer } from 'vue-final-modal';
import CompatibilityBanner from '../common/CompatibilityBanner.vue';
import CompatibilityBoundary from '../common/CompatibilityBoundary.vue';
import SecureSendIcon from '../common/SecureSendIcon.vue';
import StatusBar from '../common/StatusBar.vue';
import TBBanner from '../common/TBBanner.vue';
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
</script>

<template>
  <div id="send-page" class="container">
    <CompatibilityBoundary>
      <CompatibilityBanner />
      <TBBanner />
      <PopupView />
      <SecureSendIcon />
      <FeedbackBox />
      <StatusBar />
      <ModalsContainer />
    </CompatibilityBoundary>
  </div>
</template>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem 0;
  margin-top: 2rem;
}
p {
  color: #000;
  font-size: 13px;
  font-style: normal;
  font-weight: 400;
  line-height: normal;
}
</style>
