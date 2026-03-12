<script lang="ts" setup>
import { BASE_URL } from '@send-frontend/apps/common/constants';
import { useSendConfig } from '@send-frontend/composables/useSendConfig';
import { useAuthStore } from '@send-frontend/stores';
import { onMounted } from 'vue';

const { loginToOIDC } = useAuthStore();
const { finishLogin } = useSendConfig();

onMounted(async () => {
  const managementUrl = `${BASE_URL}/login?isExtension=true`;
  window.open(
    managementUrl,
    '_blank',
    'width=800,height=600,scrollbars=yes,resizable=yes'
  );
});
</script>

<template>
  <div class="prompt-login">
    <h1>Please log in to continue</h1>
    <p>A new window has been opened for you to log in.</p>
  </div>
</template>
