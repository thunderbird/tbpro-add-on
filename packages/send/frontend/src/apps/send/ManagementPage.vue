<!-- eslint-disable no-undef -->
<script setup lang="ts">
import { dbUserSetup } from '@/lib/helpers';
import init from '@/lib/init';
import useApiStore from '@/stores/api-store';
import useKeychainStore from '@/stores/keychain-store';
import useUserStore from '@/stores/user-store';

import BackupAndRestore from '@/apps/common/BackupAndRestore.vue';
import FeedbackBox from '@/apps/common/FeedbackBox.vue';
import { useMetricsUpdate } from '@/apps/common/mixins/metrics';
import UserDashboard from '@/apps/common/UserDashboard.vue';
import Btn from '@/apps/send/elements/BtnComponent.vue';
import useFolderStore from '@/apps/send/stores/folder-store';
import { CLIENT_MESSAGES } from '@/lib/messages';
import { validateToken } from '@/lib/validations';
import { useAuthStore } from '@/stores/auth-store';
import useMetricsStore from '@/stores/metrics';
import { useQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
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
const authStore = useAuthStore();
const { loginToMozAccount } = authStore;

const { isLoggedIn, sessionInfo } = storeToRefs(authStore);

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

async function showCurrentServerSession() {
  sessionInfo.value =
    (await api.call(`users/me`)) ?? CLIENT_MESSAGES.SHOULD_LOG_IN;
}

async function logOut() {
  await userStore.logOut();
  await validators();
  isLoggedIn.value = false;
}

async function finishLogin() {
  const isSessionValid = await validateToken(api);
  if (!isSessionValid) {
    return;
  }

  await showCurrentServerSession();
  await dbUserSetup(userStore, keychain, folderStore);
  const { isTokenValid, hasBackedUpKeys } = await validators();

  if (isTokenValid && hasBackedUpKeys) {
    try {
      await configureExtension();
    } catch (error) {
      console.warn('You are running this outside TB', error);
    }
  }

  // setIsLoggedIn(isTokenValid);
  console.log('isTokenValid', isTokenValid);
  isLoggedIn.value = true;
}

async function _loginToMozAccount() {
  loginToMozAccount(finishLogin);
}
</script>

<template>
  <div id="send-page" class="container">
    <CompatibilityBoundary>
      <CompatibilityBanner />
      <TBBanner />

      <div>isLoggedIn: {{ isLoggedIn }}</div>

      <div v-if="isLoading">
        <LoadingComponent />
      </div>

      <div v-else>
        <div v-if="isLoggedIn">
          <UserDashboard :log-out="logOut" />
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
