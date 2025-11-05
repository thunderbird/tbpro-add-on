<script setup lang="ts">
import { useIsRouteExtension } from '@send-frontend/composables/isRouteExtension';
import { dbUserSetup } from '@send-frontend/lib/helpers';
import { CLIENT_MESSAGES } from '@send-frontend/lib/messages';
import { trpc } from '@send-frontend/lib/trpc';
import { useAuthStore } from '@send-frontend/stores';
import useApiStore from '@send-frontend/stores/api-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import useUserStore from '@send-frontend/stores/user-store';
import { PrimaryButton } from '@thunderbirdops/services-ui';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import FeedbackBox from '../common/FeedbackBox.vue';

import LoginIndicator from '../common/LoginIndicator.vue';
import PublicLogin from '../common/PublicLogin.vue';
import SecureSendIcon from '../common/SecureSendIcon.vue';
import StatusBar from '../common/StatusBar.vue';
import TBBanner from '../common/TBBanner.vue';
import { useConfigStore } from './stores/config-store';
import useFolderStore from './stores/folder-store';

const { api } = useApiStore();
const { user } = useUserStore();
const userStore = useUserStore();
const { keychain } = useKeychainStore();
const folderStore = useFolderStore();
const { isPublicLogin } = useConfigStore();
const { isExtension } = useConfigStore();
const { loginToOIDC } = useAuthStore();
const { isRouteExtension } = useIsRouteExtension();

const router = useRouter();

const sessionInfo = ref(null);

onMounted(async () => {
  // We route the extension login to this page to handle the OIDC login
  // To make this as smooth as possible, we automatically trigger the login
  if (isRouteExtension.value) {
    console.log('Extension mode detected, redirecting to OIDC login...');
    await _loginToOIDC();
  }
});

async function pingSession() {
  const session = await api.call<null | string>(`users/me`);

  sessionInfo.value = session ?? CLIENT_MESSAGES.SHOULD_LOG_IN;

  if (sessionInfo.value) {
    router.push('/send/profile');
  }
}

async function onSuccess() {
  await dbUserSetup(userStore, keychain, folderStore);
  await pingSession();
}

trpc.onLoginFinished.subscribe(
  { name: 'login' },
  {
    onData: onSuccess,
  }
);

async function _loginToOIDC() {
  loginToOIDC({ onSuccess, isExtension: isRouteExtension.value });
}
</script>
<template>
  <main class="container">
    <div v-if="isRouteExtension">
      <p>Redirecting to TB Pro login...</p>
    </div>
    <div v-else>
      <TBBanner />
      <LoginIndicator v-if="!isPublicLogin" :id="user.id">
        <PrimaryButton
          v-if="!isExtension"
          primary
          data-testid="login-button-tbpro"
          @click.capture="_loginToOIDC"
          >Log in using your TB Pro Account</PrimaryButton
        >
      </LoginIndicator>
      <PublicLogin v-if="isPublicLogin" :on-success="onSuccess" />
      <FeedbackBox />
      <SecureSendIcon />
      <StatusBar />
    </div>
  </main>
</template>

<style scoped>
.container {
  padding: 1rem;
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
h2 {
  font-size: 22px;
}
</style>
