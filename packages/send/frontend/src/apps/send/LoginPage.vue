<script setup lang="ts">
import Btn from '@send-frontend/apps/send/elements/BtnComponent.vue';
import { dbUserSetup } from '@send-frontend/lib/helpers';
import { CLIENT_MESSAGES } from '@send-frontend/lib/messages';
import { trpc } from '@send-frontend/lib/trpc';
import { useAuthStore } from '@send-frontend/stores';
import useApiStore from '@send-frontend/stores/api-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import useUserStore from '@send-frontend/stores/user-store';
import { logger } from 'tbpro-shared';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import FeedbackBox from '../common/FeedbackBox.vue';
import FxaLogin from '../common/FxaLogin.vue';
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
const { loginToMozAccount, loginToOIDC } = useAuthStore();

const router = useRouter();

const sessionInfo = ref(null);

async function pingSession() {
  const session = await api.call<null | string>(`users/me`);

  sessionInfo.value = session ?? CLIENT_MESSAGES.SHOULD_LOG_IN;

  if (sessionInfo.value) {
    router.push('/send/profile');
  }
}

async function mozAcctLogin() {
  loginToMozAccount({
    onSuccess: () => {
      logger.info('Login successful');
    },
  });
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
  loginToOIDC({ onSuccess });
}
</script>
<template>
  <main class="container">
    <TBBanner />
    <FxaLogin v-if="!isPublicLogin" :id="user.id">
      <Btn primary data-testid="login-button" @click.prevent="mozAcctLogin"
        >Login to Mozilla Account</Btn
      >
      <Btn
        primary
        data-testid="login-button-tbpro"
        @click.prevent="_loginToOIDC"
        >Log in using your TB Pro Account</Btn
      >
    </FxaLogin>
    <PublicLogin v-if="isPublicLogin" :on-success="onSuccess" />
    <FeedbackBox />
    <SecureSendIcon />
    <StatusBar />
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
