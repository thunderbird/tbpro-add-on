<script setup lang="ts">
import LogOutButton from '@send-frontend/apps/send/elements/LogOutButton.vue';
import { useAuth } from '@send-frontend/lib/auth';
import { DAYS_TO_EXPIRY, SIGN_OUT } from '@send-frontend/lib/const';
import { trpc } from '@send-frontend/lib/trpc';
import useUserStore from '@send-frontend/stores/user-store';
import { useQuery } from '@tanstack/vue-query';
import prettyBytes from 'pretty-bytes';
import { computed } from 'vue';
import ProgressBarDashboard from '../send/components/ProgressBarDashboard.vue';
import { useConfigStore } from '../send/stores/config-store';
import { useStatusStore } from '../send/stores/status-store';
import LoadingComponent from './LoadingComponent.vue';
import RenderOnEnvironment from './RenderOnEnvironment.vue';

const { user } = useUserStore();
const { isExtension: isRouteMozExtension } = useConfigStore();
const { validators } = useStatusStore();
const { clearUserFromStorage } = useUserStore();
const { logOutAuth } = useAuth();

const handleLogout = async () => {
  try {
    await clearUserFromStorage();
    await logOutAuth();
    await validators();
  } catch (e) {
    console.log(`handleLogout error`);
    console.log(e);
  } finally {
    if (isRouteMozExtension) {
      // Let background.ts know that we have logged out.
      browser.runtime.sendMessage({
        type: SIGN_OUT,
      });
    } else {
      location.reload();
    }

  }
};

const {
  data: size,
  error,
  isLoading: loadingSize,
} = useQuery({
  queryKey: ['getTotalSize'],
  queryFn: async () => {
    return trpc.getTotalUsedStorage.query();
  },
});

const { data: u, isLoading: loadingDashboard } = useQuery({
  queryKey: ['getUserDataDashboard'],
  queryFn: async () => {
    return await trpc.getUserData.query();
  },
});

const isLoading = computed(() => {
  return loadingSize.value || loadingDashboard.value;
});

const hasLimitedStorage = computed(() => {
  return u?.value?.userData?.tier === 'EPHEMERAL';
});

const activeText = computed(() => {
  const activeText = prettyBytes(size.value.active);
  const limitText = prettyBytes(size.value.limit);

  return `${activeText} of ${limitText}`;
});

const percentageUsed = computed(() => {
  return (size.value.active * 100) / size.value.limit;
});
</script>
<template>
  <section class="min-w-72">
    <h1>Send Storage</h1>
    <p v-if="error">{{ error.message }}</p>
    <h2 class="email">{{ user.thundermailEmail }}</h2>

    <LoadingComponent v-if="isLoading" />

    <div v-else>
      <p v-if="hasLimitedStorage">
        Total storage used:
        <span class="active">{{ size?.active }} active</span> /
        <span class="expired">{{ size?.expired }} expired</span>
      </p>

      <div v-if="!error && !loadingSize">
        <p class="font-bold">{{ activeText }}</p>
        <ProgressBarDashboard :percentage="percentageUsed" />
      </div>

      <p v-if="hasLimitedStorage">
        Your files expire after {{ DAYS_TO_EXPIRY }} days
      </p>

      <RenderOnEnvironment
        :environment-type="[
          'WEB APP OUTSIDE THUNDERBIRD',
          'EXTENSION INSIDE THUNDERBIRD',
        ]"
      >
        <log-out-button :log-out="handleLogout" />
      </RenderOnEnvironment>
    </div>
  </section>
</template>

<style lang="css" scoped>
h1 {
  font-size: 20px;
  font-weight: 500;
}
.expired {
  color: var(--colour-ti-critical);
}
.active {
  color: var(--colour-send-primary);
}
.email {
  color: #737584;
  font-weight: 400;
  font-size: 16px;
}
</style>
