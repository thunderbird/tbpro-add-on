<script setup lang="ts">
import { BASE_URL } from '@send-frontend/apps/common/constants';
import ProButton from '@send-frontend/apps/common/ProButton.vue';
import { useL10n } from '@send-frontend/l10n';

const { t } = useL10n();

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
  <p>{{ t('send-dashboard-addon-description') }}</p>
  <ProButton @click="menuManageSend">{{
    t('send-dashboard-addon-button')
  }}</ProButton>
</template>
