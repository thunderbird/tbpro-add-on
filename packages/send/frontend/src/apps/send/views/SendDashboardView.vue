<script setup lang="ts">
import BackupAndRestore from '@send-frontend/apps/common/BackupAndRestore.vue';
import { BASE_URL } from '@send-frontend/apps/common/constants';
import UserDashboard from '@send-frontend/apps/common/UserDashboard.vue';
import { useAuth } from '@send-frontend/lib/auth';
import {
  useApiStore,
  useStatusStore,
  useUserStore,
} from '@send-frontend/stores';
import { useQuery } from '@tanstack/vue-query';
import { PrimaryButton } from '@thunderbirdops/services-ui';
import { storeToRefs } from 'pinia';
import SubscriptionsWrapper from '../components/SubscriptionsWrapper.vue';
import { useAutoConfigureAddon } from '../composables/useAutoConfigureAddon';
import { useVerificationStore } from '../stores/verification-store';

const { isTbproExtension } = defineProps<{
  isTbproExtension?: boolean;
}>();

const { api } = useApiStore();
const verificationStore = useVerificationStore();
const { sessionUUID } = verificationStore;
const { generatedCode } = storeToRefs(verificationStore);
const { clearUserFromStorage } = useUserStore();
const { validators } = useStatusStore();
const { logOutAuth } = useAuth();

const handleLogout = async () => {
  await clearUserFromStorage();
  await logOutAuth();
  await validators();
  location.reload();
};

// We use this to auto configure the addon and verify the session
if (isTbproExtension) {
  useAutoConfigureAddon();
}

const { data: otpcode } = useQuery({
  queryKey: ['generateVerificationCode'],
  queryFn: async () => {
    // This api call emits the websocket event that triggers active clients to the verification page
    await api.call(`verify/request?code=${sessionUUID}`);
    const response = await api.call<{ code: string; createdAt: string }>(
      'verify/generate'
    );
    return response.code;
  },
});

function openDashboard() {
  const webDashboardUrl = new URL(`${BASE_URL}/send/profile`);
  webDashboardUrl.searchParams.set('source', 'tbpro-extension');
  webDashboardUrl.searchParams.set('code', otpcode.value);
  generatedCode.value = otpcode.value;
  window.open(
    webDashboardUrl,
    '_blank',
    'width=800,height=600,scrollbars=yes,resizable=yes'
  );
}
</script>

<template>
  <router-view></router-view>
  <SubscriptionsWrapper v-if="isTbproExtension">
    <p>
      Encrypted Storage: Manage your files and settings in the Send dashboard.
    </p>
    <PrimaryButton @click="openDashboard"> Open dashboard </PrimaryButton>
    <PrimaryButton @click="handleLogout"> Log out </PrimaryButton>
  </SubscriptionsWrapper>
  <!-- Web only -->
  <div v-else>
    <UserDashboard />
    <BackupAndRestore />
  </div>
</template>
