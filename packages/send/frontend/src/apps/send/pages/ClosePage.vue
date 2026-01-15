<script lang="ts" setup>
import { ADDON_TO_WEBAPP, SIGN_IN_COMPLETE } from '@send-frontend/lib/const';

// Try window.close every 3 seconds to close the window after authentication
setInterval(() => {
  window.close();
  console.log('Attempting to close window...');

  window.postMessage(
    { type: SIGN_IN_COMPLETE },
    window.location.origin
  );

}, 3000);

// Listen for ADDON_TO_WEBAPP: add-on -> bridge -> web app
window.addEventListener('message', async (e) => {
  if (e.origin === window.location.origin && e.data?.type === ADDON_TO_WEBAPP) {
    alert(
      `🐦‍🔥 [web-app:close-page] received message: ${e.data?.payload?.message}`
    );
  }
  return new Promise((resolve) => {
    resolve(true);
  });

});

</script>

<template>
  <div class="close-page-container">
    <h2>Authentication Complete</h2>
    <p>You can now close this window and return to Thunderbird.</p>
  </div>
</template>

<style scoped>
.close-page-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
}
h2 {
  margin: 0;
  font-size: 1.5rem;
}
p {
  margin: 0;
  font-size: 1rem;
}
</style>
