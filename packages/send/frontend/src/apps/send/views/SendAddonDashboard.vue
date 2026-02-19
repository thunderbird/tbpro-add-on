<script setup lang="ts">
import { BASE_URL } from '@send-frontend/apps/common/constants';
import ProButton from '@send-frontend/apps/common/ProButton.vue';

/**
 * Opens the Thunderbird Send application in a new tab.
 * Users can access their files and manage Send settings.
 */
async function menuManageSend() {
  await browser.tabs.create({
    url: `${BASE_URL}/send/profile?showDashboard=true`,
  });
}
</script>

<template>
  <p>
    Encrypted Storage: Manage your files and settings in the Send dashboard.
  </p>
  <ProButton @click="menuManageSend">Open Dashboard</ProButton>
</template>
