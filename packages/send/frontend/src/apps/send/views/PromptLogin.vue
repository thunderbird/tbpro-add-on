<script lang="ts" setup>
import { SIGN_IN } from '@send-frontend/lib/const';
import { onMounted } from 'vue';

onMounted(async () => {
  // send the bridge a login message to trigger SIGN_IN from background
  await browser.runtime.sendMessage({ type: SIGN_IN });
});
</script>

<template>
  <div class="prompt-login">
    <h1>Please log in to continue</h1>
    <p>A new window has been opened for you to log in.</p>
  </div>
</template>
