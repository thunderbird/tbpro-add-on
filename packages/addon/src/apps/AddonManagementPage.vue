<script setup lang="ts">
import { BASE_URL } from '@send-frontend/apps/common/constants';
import LoadingComponent from '@send-frontend/apps/common/LoadingComponent.vue';
import LogOutButton from '@send-frontend/apps/send/elements/LogOutButton.vue';
import { useAuth } from '@send-frontend/lib/auth';
import AuthButtons from '@send-frontend/lib/auth/AuthButtons.vue';
import {
  useAuthStore,
  useUserStore as useUserStoreSend,
} from '@send-frontend/stores';
import AdminPage from './AdminPage.vue';

const authStore = useAuthStore();
const { clearUserFromStorage: clearUser_send } = useUserStoreSend();
const { isLoggedIn, refetchAuth, logOutAuth, isLoadingAuth } = useAuth();
const { loginToOIDC, loginToMozAccount } = authStore;

const handleLogout = async () => {
  await logOutAuth();
  await clearUser_send();
};

async function _loginToMozAccount() {
  loginToMozAccount({ onSuccess: refetchAuth });
}

async function _loginToOIDC() {
  loginToOIDC({ onSuccess: refetchAuth, isExtension: true });
}

function _loginToOIDCForExtension() {
  const managementUrl = `${BASE_URL}/login?isExtension=true`;
  window.open(
    managementUrl,
    '_blank',
    'width=800,height=600,scrollbars=yes,resizable=yes'
  );
}
</script>

<template>
  <div class="container">
    <LoadingComponent v-if="isLoadingAuth" />
    <div v-else>
      <div v-if="!isLoggedIn">
        <AuthButtons
          :is-extension="true"
          :login-to-moz-account="_loginToMozAccount"
          :login-to-oidc="_loginToOIDC"
          :login-to-oidc-for-extension="_loginToOIDCForExtension"
        />
      </div>

      <log-out-button v-if="isLoggedIn" :log-out="handleLogout" />

      <AdminPage v-if="isLoggedIn" />
    </div>
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
