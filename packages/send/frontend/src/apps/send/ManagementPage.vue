<!-- eslint-disable no-undef -->
<script setup lang="ts">
import { BASE_URL } from '@send-frontend/apps/common/constants';
import FeedbackBox from '@send-frontend/apps/common/FeedbackBox.vue';
import { useMetricsUpdate } from '@send-frontend/apps/common/mixins/metrics';
import SendDashboardView from '@send-frontend/apps/send/views/SendDashboardView.vue';
import { useSendConfig } from '@send-frontend/composables/useSendConfig';
import { useAuth } from '@send-frontend/lib/auth';
import AuthButtons from '@send-frontend/lib/auth/AuthButtons.vue';
import { useConfigStore } from '@send-frontend/stores';
import { useAuthStore } from '@send-frontend/stores/auth-store';
import { useQuery } from '@tanstack/vue-query';
import { ModalsContainer } from 'vue-final-modal';
import CompatibilityBanner from '../common/CompatibilityBanner.vue';
import CompatibilityBoundary from '../common/CompatibilityBoundary.vue';
import LoadingComponent from '../common/LoadingComponent.vue';
import SecureSendIcon from '../common/SecureSendIcon.vue';
import TBBanner from '../common/TBBanner.vue';

const { isLoggedIn } = useAuth();
const { finishLogin, loadLogin } = useSendConfig();
const { isExtension } = useConfigStore();
const { updateMetricsIdentity } = useMetricsUpdate();
const authStore = useAuthStore();
const { loginToOIDC, loginToMozAccount } = authStore;

const { isLoading } = useQuery({
  queryKey: ['getLoginStatus'],
  queryFn: async () => await loadLogin(),
  refetchOnWindowFocus: 'always',
  refetchOnMount: true,
  refetchOnReconnect: true,
});

updateMetricsIdentity();

async function _loginToOIDC() {
  loginToOIDC({ onSuccess: finishLogin, isExtension });
}

async function _loginToMozAccount() {
  loginToMozAccount({ onSuccess: finishLogin });
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
  <div id="send-page" class="container">
    <CompatibilityBoundary>
      <CompatibilityBanner />
      <TBBanner />

      <div v-if="isLoading">
        <LoadingComponent />
      </div>

      <div v-else>
        <div v-if="isLoggedIn">
          <SendDashboardView />
        </div>

        <div v-else class="flex flex-col items-start gap-4">
          <AuthButtons
            :is-extension="isExtension"
            :login-to-moz-account="_loginToMozAccount"
            :login-to-oidc="_loginToOIDC"
            :login-to-oidc-for-extension="_loginToOIDCForExtension"
          />
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
