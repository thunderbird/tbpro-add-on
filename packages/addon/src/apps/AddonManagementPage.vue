<script setup lang="ts">
import TbproLogo from '@addon/assets/TbproLogo.vue';
import WithLoader from '@addon/assets/WithLoader.vue';
import { BASE_URL } from '@send-frontend/apps/common/constants';
import { useAuth } from '@send-frontend/lib/auth';
import AuthButtons from '@send-frontend/lib/auth/AuthButtons.vue';
import { useAuthStore } from '@send-frontend/stores';
import AdminPage from './AdminPage.vue';

const authStore = useAuthStore();

const { isLoggedIn, refetchAuth, isLoadingAuth } = useAuth();
const { loginToOIDC } = authStore;

async function _loginToOIDC() {
  loginToOIDC({ onSuccess: refetchAuth, isExtension: true });
}

async function openLoginPage() {
  await browser.tabs.create({
    url: `${BASE_URL}/login?isExtension=true`,
  });
}
</script>

<template>
  <div class="content">
    <TbproLogo />
    <WithLoader :is-loading="isLoadingAuth">
      <div v-if="!isLoggedIn" class="login-section">
        <p class="description">
          Sign in with Thunderbird Pro to use Send or restore access to your
          encrypted files.
        </p>
        <AuthButtons
          :is-extension="true"
          :login-to-oidc="_loginToOIDC"
          :login-to-oidc-for-extension="openLoginPage"
        />
      </div>
      <AdminPage v-else />
    </WithLoader>
  </div>
</template>

<style scoped>
.content {
  display: flex;
  flex-direction: column;
  align-items: start;
  justify-content: center;
  padding: 2rem;
  max-width: 700px;
  margin: 0 auto;
  width: 100%;
  padding: 1rem;
  max-width: 52rem;
}

.login-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.header-section {
  margin-bottom: 0.5rem;
}

.description {
  color: #333;
  font-size: 16px;
  line-height: 1.6;
  margin: 1rem 0 0 0;
}
</style>
