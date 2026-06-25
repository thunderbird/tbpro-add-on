<script lang="ts" setup>
import { FORCE_CLOSE_WINDOW, SIGN_IN_COMPLETE } from '@send-frontend/lib/const';
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

/**
 * Signal a completed sign-in to the add-on, then close this tab.
 *
 * The token-bridge content script relays window messages to the background
 * script, which owns tab teardown — so the order matters:
 *   1. SIGN_IN_COMPLETE  — lets the background run its post-login work
 *      (FTUE check, register Send, close the tracked login tab).
 *   2. FORCE_CLOSE_WINDOW — explicitly closes *this* tab (the message sender),
 *      in case the background's closeLoginTab() doesn't match it.
 *   3. window.close()     — last-resort fallback if no bridge/background is
 *      listening (e.g. the page is open in a plain browser tab).
 *
 * Both messages must be posted before the tab is torn down; the bridge relays
 * them to the background, which performs the actual close.
 */
async function closeOnSignInComplete() {
  try {
    window.postMessage({ type: SIGN_IN_COMPLETE }, window.location.origin);
  } catch (error) {
    console.error('Error posting SIGN_IN_COMPLETE message:', error);
  }

  try {
    window.postMessage({ type: FORCE_CLOSE_WINDOW }, window.location.origin);
  } catch (error) {
    console.error('Error posting FORCE_CLOSE_WINDOW message:', error);
  }

  // Fallback for contexts without the token bridge. This is a no-op in a normal
  // Thunderbird tab (which only the background can close), but harmless here.
  try {
    window.close();
  } catch (error) {
    console.error('Error closing window:', error);
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
