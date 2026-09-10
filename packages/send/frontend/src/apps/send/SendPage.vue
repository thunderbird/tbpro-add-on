<script setup lang="ts">
import { useMetricsUpdate } from '@send-frontend/apps/common/mixins/metrics';
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import init from '@send-frontend/lib/init';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import useMetricsStore from '@send-frontend/stores/metrics';
import useUserStore from '@send-frontend/stores/user-store';

import { onMounted } from 'vue';
import { ModalsContainer } from 'vue-final-modal';
import CompatibilityBanner from '../common/CompatibilityBanner.vue';
import CompatibilityBoundary from '../common/CompatibilityBoundary.vue';
import ErrorBoundary from '../common/ErrorBoundary.vue';
import { INIT_ERRORS } from './const';
import SendTemplate from './views/SendTemplate.vue';

const userStore = useUserStore();
const { keychain } = useKeychainStore();
const folderStore = useFolderStore();
const { initializeClientMetrics } = useMetricsStore();
const { updateMetricsIdentity } = useMetricsUpdate();

onMounted(async () => {
  // Non-zero values indicate a specific error has occurred.
  const errorCode = await init(userStore, keychain, folderStore);

  // A locked keychain (passphrase changed on another client) is a terminal state
  // here: re-populating the user and retrying init() can't help because the stale
  // local passphrase still can't unwrap the server backup. Retrying would just run
  // init() again for nothing. The router's requiresBackedUpKeys guard redirects a
  // locked keychain to /passphrase-changed, so simply stop and let recovery take
  // over — never fall through to the retry (which is only useful for a missing/
  // unpopulated user session).
  if (errorCode === INIT_ERRORS.KEYCHAIN_LOCKED) {
    console.info('init: keychain locked — routing to passphrase recovery.');
    return;
  }

  if (errorCode) {
    console.info('init error: ', Object.keys(INIT_ERRORS)[errorCode]);
    // Load from backend session and retry init()
    const didPopulate = await userStore.populateFromBackend();
    if (!didPopulate) {
      return;
    }
    await init(userStore, keychain, folderStore);
    await userStore.store();
  }
  // Identify user for analytics
  const uid = userStore.user.uniqueHash;
  initializeClientMetrics(uid);
});

updateMetricsIdentity();
</script>

<template>
  <ErrorBoundary>
    <CompatibilityBoundary>
      <CompatibilityBanner />
      <SendTemplate>
        <router-view></router-view>
      </SendTemplate>
      <ModalsContainer />
    </CompatibilityBoundary>
  </ErrorBoundary>
</template>
