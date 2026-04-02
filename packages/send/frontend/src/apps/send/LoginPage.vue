<script setup lang="ts">
/**
 * LoginPage — Web to add-on entry point (Step 1 of the flow).
 *
 * Web to add-on is the standard web-initiated OIDC login:
 *
 * ┌─────────────────── Web to add-on flow ──────────────────────────────────┐
 * │ 1. User lands on /login (web) or the extension opens this page      │
 * │    at /auto-login.                                                  │
 * │ 2. loginToOIDC() calls userManager.signinRedirect(), which          │
 * │    redirects the browser to accounts.tb.pro for authentication.     │
 * │ 3. The user authenticates on accounts.tb.pro.                       │
 * │ 4. accounts.tb.pro redirects back to /post-login with an auth code. │
 * │ 5. PostLoginPage.vue calls handleOIDCCallback(), which exchanges    │
 * │    the code for tokens (access + refresh + id).                     │
 * │ 6. handleOIDCCallback() posts OIDC_TOKEN + OIDC_USER via            │
 * │    window.postMessage so the token-bridge content script can        │
 * │    forward them to the background script.                           │
 * │ 7. background.ts receives OIDC_USER → stores full User object in    │
 * │    browser.storage.local[STORAGE_KEY_AUTH] (so the extension popup  │
 * │    and other web pages can read it back later via loadUser()).       │
 * │    background.ts receives OIDC_TOKEN → creates/updates the          │
 * │    Thundermail mail account using the refresh token.                │
 * │ 8. handleOIDCCallback() POSTs the access_token to                   │
 * │    auth/oidc/authenticate. The backend introspects it, finds/       │
 * │    creates the user, and issues httpOnly JWT session cookies.        │
 * │ 9. PostLoginPage redirects to /send/profile.                        │
 * └──────────────────────────────────────────────────────────────────────┘
 */
import { useIsRouteExtension } from '@send-frontend/composables/isRouteExtension';
import { dbUserSetup } from '@send-frontend/lib/helpers';
import { CLIENT_MESSAGES } from '@send-frontend/lib/messages';
import { trpc } from '@send-frontend/lib/trpc';
import { useAuthStore } from '@send-frontend/stores';
import useApiStore from '@send-frontend/stores/api-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import useUserStore from '@send-frontend/stores/user-store';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import FeedbackBox from '../common/FeedbackBox.vue';

import PublicLogin from '../common/PublicLogin.vue';
import SecureSendIcon from '../common/SecureSendIcon.vue';
import TBBanner from '../common/TBBanner.vue';
import { useConfigStore } from './stores/config-store';
import useFolderStore from './stores/folder-store';

const sessionInfo = ref(null);

const { api } = useApiStore();
const router = useRouter();
const userStore = useUserStore();
const { keychain } = useKeychainStore();
const folderStore = useFolderStore();
const { isPublicLogin } = useConfigStore();
const { openManagementPage, isThunderbirdHost } = useConfigStore();
const { loginToOIDC } = useAuthStore();
const { isRouteExtension } = useIsRouteExtension();

onMounted(async () => {
  // We route the extension login to this page to handle the OIDC login
  // To make this as smooth as possible, we automatically trigger the login
  if (!isPublicLogin) {
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
  if (isThunderbirdHost) {
    await openManagementPage();
  }
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
    <div v-if="!isPublicLogin">
      <p>Redirecting to TB Pro login...</p>
    </div>
    <div v-else>
      <TBBanner />
      <PublicLogin v-if="isPublicLogin" :on-success="onSuccess" />
      <FeedbackBox />
      <SecureSendIcon />
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
