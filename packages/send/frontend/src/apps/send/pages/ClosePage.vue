<script lang="ts" setup>
import { SIGN_IN_COMPLETE } from '@send-frontend/lib/const';
import { onMounted } from 'vue';

// Removed as we re-evaluate the system add-on FTUE
// Tracked on https://github.com/thunderbird/tbpro-add-on/issues/915
// async function checkForFTUE() {
//   const ftueResponse = await api.call<{ isFTUEComplete: boolean }>(
//     'users/ftue'
//   );

//   if (!ftueResponse?.isFTUEComplete) {
//     router.push(`/ftue`);
//     return;
//   }
// }

async function closeOnSignInComplete() {
  window.close();
  window.postMessage({ type: SIGN_IN_COMPLETE }, window.location.origin);
  try {
    window.postMessage({ type: 'FORCE_CLOSE_WINDOW' }, window.location.origin);
  } catch (error) {
    console.error('Error posting message to parent window:', error);
  }
}

onMounted(async () => {
  // await checkForFTUE();
  await closeOnSignInComplete();
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
