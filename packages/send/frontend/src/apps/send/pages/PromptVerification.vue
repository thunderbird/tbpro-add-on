<script lang="ts" setup>
import { trpc } from '@send-frontend/lib/trpc';
import { useApiStore } from '@send-frontend/stores';
import { useQuery } from '@tanstack/vue-query';
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useVerificationStore } from '../stores/verification-store';

const { api } = useApiStore();
const { sessionUUID } = useVerificationStore();
const { handleSuccessfulVerificationForNewClient } = useVerificationStore();
const router = useRouter();

const codeVerification = ref<string | null>(null);
const timeRemaining = ref<number>(60);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

const verifyCode = async (data: { code: string }) => {
  if (!data || !data.code) {
    console.error('Verification failed: no code provided');
    return;
  }
  codeVerification.value = data.code;
  router.back(); // Navigate back after verification
};

const { data, refetch } = useQuery({
  queryKey: ['generateVerificationCode'],
  queryFn: async () => {
    // This api call emits the websocket event that triggers active clients to the verification page
    await api.call(`verify/request?code=${sessionUUID}`);
    const response = await api.call<{ code: string; createdAt: string }>(
      'verify/generate'
    );

    // Start countdown timer when we get a new code
    startCountdown();

    return response.code;
  },
});

const startCountdown = () => {
  // Clear existing timer if any
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }

  timeRemaining.value = 60;

  countdownTimer = setInterval(() => {
    timeRemaining.value--;

    if (timeRemaining.value <= 0) {
      // Time expired, generate a new code
      refetch();
    }
  }, 1000);
};

onMounted(() => {
  // Start countdown when component mounts and we have initial data
  if (data.value) {
    startCountdown();
  }
});

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer);
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
    onData: verifyCode,
  }
);

// This is the final step. After the existing client has verified that the new client is trusted, they will share their encrypted passphrase and trigger this event.
trpc.onPassphraseShared.subscribe(
  // This code is unused but it might be useful to tell which client is making the request in the future
  { code: 'data.value' },
  {
    onData: async (pars) =>
      await handleSuccessfulVerificationForNewClient(
        pars,
        codeVerification.value
      ),
  }
);
</script>

<template>
  <h1>Open an active device and enter this code</h1>
  <p>
    Please enter this 6-digit verification code on a device with an active
    session
  </p>
  <input
    type="text"
    :value="data"
    readonly
    style="
      font-family: monospace;
      font-size: 24px;
      text-align: center;
      letter-spacing: 2px;
    "
  />
  <p style="margin-top: 10px; font-size: 14px; color: #666">
    Code expires in: <strong>{{ timeRemaining }}</strong> seconds
    <span v-if="timeRemaining <= 10" style="color: #ff4444"> - Hurry up!</span>
  </p>
  <button
    style="
      margin-top: 10px;
      padding: 8px 16px;
      background-color: #007acc;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    "
    @click="() => refetch()"
  >
    Generate New Code
  </button>
  <p v-if="codeVerification">
    New device verified. Reference ID: <strong>{{ codeVerification }}</strong>
  </p>
</template>
