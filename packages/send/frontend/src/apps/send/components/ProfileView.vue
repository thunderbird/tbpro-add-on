<script setup lang="ts">
import BackupAndRestore from '@send-frontend/apps/common/BackupAndRestore.vue';
import SecureSendIcon from '@send-frontend/apps/common/SecureSendIcon.vue';
import UserDashboard from '@send-frontend/apps/common/UserDashboard.vue';
import { useConfigStore } from '@send-frontend/stores';
import { onBeforeMount } from 'vue';

const { isThunderbirdHost } = useConfigStore();

onBeforeMount(() => {
  // We don't want users to navigate the web application from the extension, just log in
  // So if they're logged in, this window will close
  if (isThunderbirdHost) {
    window.close();
  }
});
</script>
<template>
  <div class="container">
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
