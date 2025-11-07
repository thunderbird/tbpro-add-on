<script setup lang="ts">
import BackupAndRestore from '@send-frontend/apps/common/BackupAndRestore.vue';
import LoadingComponent from '@send-frontend/apps/common/LoadingComponent.vue';
import SecureSendIcon from '@send-frontend/apps/common/SecureSendIcon.vue';
import UserDashboard from '@send-frontend/apps/common/UserDashboard.vue';
import { useConfigStore } from '@send-frontend/stores';
import { useDebounceFn } from '@vueuse/core';
import { onBeforeMount, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const { isThunderbirdHost } = useConfigStore();
const router = useRouter();

const close = useDebounceFn(() => {
  // This window should close automatically when opened from Thunderbird
  window.close();
  // This is a fallback so that the user doesn't navigate inside the web app if the window doesn't close
  router.push('/close');
}, 1_000);

onBeforeMount(() => {
  // We don't want users to navigate the web application from the extension, just log in
  // So if they're logged in, this window will close
  if (isThunderbirdHost) {
    close();
  }
});
onMounted(() => {
  if (isThunderbirdHost) {
    close();
  }
});

if (isThunderbirdHost) {
  close();
}
</script>
<template>
  <LoadingComponent v-if="isThunderbirdHost" />
  <div v-else class="container">
    <UserDashboard />
    <BackupAndRestore />
    <SecureSendIcon />
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
