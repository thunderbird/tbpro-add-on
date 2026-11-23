<script lang="ts" setup>
import { useL10n } from '@send-frontend/l10n';
import { SIGN_IN } from '@send-frontend/lib/const';
import { onMounted } from 'vue';

const { t } = useL10n();

onMounted(async () => {
  // send the bridge a login message to trigger SIGN_IN from background
  await browser.runtime.sendMessage({ type: SIGN_IN });
});
</script>

<template>
  <div class="prompt-login">
    <h1>{{ t('send-popup-login-title') }}</h1>
    <p>{{ t('send-popup-login-body') }}</p>
  </div>
</template>
