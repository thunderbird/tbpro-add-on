<script setup lang="ts">
import LoadingComponent from '@send-frontend/apps/common/LoadingComponent.vue';
import UserDashboard from '@send-frontend/apps/common/UserDashboard.vue';
import { useIsExtension } from '@send-frontend/composables/useIsExtension';
import { useConfigStore } from '@send-frontend/stores';
import { useDebounceFn } from '@vueuse/core';
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const { isThunderbirdHost } = useConfigStore();
const { environmentType } = useIsExtension();
const router = useRouter();

const shouldShowDashboard = computed(() => {
  if (environmentType.value === 'WEB APP OUTSIDE THUNDERBIRD') return true;

  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('showDashboard') === 'true';
});

const close = useDebounceFn(() => {
  // if the url contains ?showDashboard=true, we don't close the window
  if (shouldShowDashboard.value) {
    return;
  }
  // This window should close automatically when opened from Thunderbird
  window.close();
  // This is a fallback so that the user doesn't navigate inside the web app if the window doesn't close
  router.push('/close');
}, 300);

onMounted(() => {
  if (isThunderbirdHost) {
    close();
  }
});
</script>
<template>
  <div v-if="!shouldShowDashboard">
    <LoadingComponent />
  </div>
  <div v-else class="container">
    <div class="profile"><UserDashboard /></div>
  </div>
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';

p {
  color: #000;
  font-size: 13px;
  font-style: normal;
  font-weight: 400;
  line-height: normal;
}
</style>
