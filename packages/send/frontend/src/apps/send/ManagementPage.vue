<!-- eslint-disable no-undef -->
<script setup lang="ts">
import { dbUserSetup } from '@send-frontend/lib/helpers';
import init from '@send-frontend/lib/init';
import useApiStore from '@send-frontend/stores/api-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import useUserStore from '@send-frontend/stores/user-store';

import BackupAndRestore from '@send-frontend/apps/common/BackupAndRestore.vue';
import FeedbackBox from '@send-frontend/apps/common/FeedbackBox.vue';
import { useMetricsUpdate } from '@send-frontend/apps/common/mixins/metrics';
import UserDashboard from '@send-frontend/apps/common/UserDashboard.vue';
import Btn from '@send-frontend/apps/send/elements/BtnComponent.vue';
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import { useAuth } from '@send-frontend/lib/auth';
import { CLIENT_MESSAGES } from '@send-frontend/lib/messages';
import { validateToken } from '@send-frontend/lib/validations';
import { useAuthStore } from '@send-frontend/stores/auth-store';
import useMetricsStore from '@send-frontend/stores/metrics';
import { useQuery } from '@tanstack/vue-query';
import { ref } from 'vue';
import { ModalsContainer } from 'vue-final-modal';
import CompatibilityBanner from '../common/CompatibilityBanner.vue';
import CompatibilityBoundary from '../common/CompatibilityBoundary.vue';
import LoadingComponent from '../common/LoadingComponent.vue';
import SecureSendIcon from '../common/SecureSendIcon.vue';
import TBBanner from '../common/TBBanner.vue';
import { useExtensionStore } from './stores/extension-store';
import { useStatusStore } from './stores/status-store';

const userStore = useUserStore();
const { keychain } = useKeychainStore();
const { api } = useApiStore();
const folderStore = useFolderStore();
const { validators } = useStatusStore();
const { configureExtension } = useExtensionStore();
const { initializeClientMetrics, sendMetricsToBackend } = useMetricsStore();
const { updateMetricsIdentity } = useMetricsUpdate();
const { isLoggedIn } = useAuth();
const authStore = useAuthStore();
const { loginToMozAccount } = authStore;

const loginFailureMessage = ref(null);

const { isLoading } = useQuery({
  queryKey: ['getLoginStatus'],
  queryFn: async () => await loadLogin(),
  refetchOnWindowFocus: 'always',
  refetchOnMount: true,
  refetchOnReconnect: true,
});

const loadLogin = async () => {
  // Check for data inconsistencies between local storage and api
  const { hasForcedLogin } = await validators();
  if (hasForcedLogin) {
    // If we don't have a session, show the login button.
    isLoggedIn.value = false;
    return;
  }

  // check local storage first
  await userStore.loadFromLocalStorage();

  try {
    // See if we already have a valid session.
    // If so, hydrate our user using session data.
    const didPopulate = await userStore.populateFromBackend();
    if (!didPopulate) {
      return;
    }
    // app-sepcific initialization
    await init(userStore, keychain, folderStore);
    await finishLogin();
  } catch (e) {
    console.log(e);
  }

  // Identify user for analytics
  const uid = userStore?.user?.uniqueHash;
  initializeClientMetrics(uid);
  await sendMetricsToBackend(api);
};

updateMetricsIdentity();

async function finishLogin() {
  const isSessionValid = await validateToken(api);
  if (!isSessionValid) {
    loginFailureMessage.value = CLIENT_MESSAGES.SHOULD_LOG_IN;
    return;
  }

  await dbUserSetup(userStore, keychain, folderStore);
  const { isTokenValid, hasBackedUpKeys } = await validators();

  if (isTokenValid && hasBackedUpKeys) {
    try {
      await configureExtension();
    } catch (error) {
      console.warn('You are running this outside TB', error);
    }
  }

  console.log('isTokenValid', isTokenValid);
  isLoggedIn.value = true;
}

async function _loginToMozAccount() {
  loginToMozAccount({ onSuccess: finishLogin });
}
</script>

<template>
  <div id="send-page" class="container">
    <CompatibilityBoundary>
      <CompatibilityBanner />
      <TBBanner />

      <div v-if="isLoading">
        <LoadingComponent />
      </div>

      <div v-else>
        <div v-if="isLoggedIn">
          <UserDashboard />
          <BackupAndRestore />
        </div>

        <div v-else>
          <Btn
            primary
            data-testid="login-button"
            @click.prevent="_loginToMozAccount"
            >Log into Mozilla Account</Btn
          >
        </div>
      </div>

      <FeedbackBox />
      <SecureSendIcon />
      <ModalsContainer />
    </CompatibilityBoundary>
  </div>
</template>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  align-items: start;
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
