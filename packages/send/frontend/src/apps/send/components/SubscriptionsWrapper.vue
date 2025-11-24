<script lang="ts" setup>
import { trpc } from '@send-frontend/lib/trpc';
import { ref, watch } from 'vue';

const shoudRefreshWs = ref(false);

watch(shoudRefreshWs, (newVal) => {
  if (newVal) {
    // Reload the page to refresh WebSocket connections
    alert('WebSocket connection lost. Reloading page to reconnect...');
    window.location.reload();
  }
});

/*
==== SUBSCRIPTIONS ====
These subscriptions listen for events from the backend to handle verification processes.
They are essential for real-time updates during the verification flow.
 */

trpc.onVerificationFinished.subscribe(
  // This code is unused but it might be useful to tell which client is making the request in the future
  { code: 'data.value' },
  {
    onStarted() {
      console.log('✅ Verification finished subscription started');
    },
    onStopped() {
      shoudRefreshWs.value = true;
    },
  }
);

// This is the final step. After the existing client has verified that the new client is trusted, they will share their encrypted passphrase and trigger this event.
trpc.onPassphraseShared.subscribe(
  // This code is unused but it might be useful to tell which client is making the request in the future
  { code: 'data.value' },
  {
    onStarted() {
      console.log('✅ Passphrase shared subscription started');
    },
    onStopped() {
      shoudRefreshWs.value = true;
    },
  }
);
</script>

<template>
  <slot></slot>
</template>
