<script setup lang="ts">
import { useConfigStore } from '@send-frontend/stores';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const countdown = ref(5);
const router = useRouter();
const { isExtension } = useConfigStore();

onMounted(() => {
  const interval = setInterval(() => {
    countdown.value--;

    if (countdown.value <= 0) {
      clearInterval(interval);
      // Redirect to the homepage or close the window based on the context
      if (isExtension) {
        window.close();
      } else {
        router.push('/');
      }
    }
  }, 1000);
});
</script>
<template>
  <main class="container">
    <p>You're logged out</p>
    <p v-if="isExtension" class="countdown">
      This page will close in {{ countdown }} seconds...
    </p>
    <p v-else data-testid="redirecting-p">
      You will be redirected to the homepage in {{ countdown }} seconds...
    </p>
  </main>
</template>

<style scoped>
.container {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: start;
  justify-content: center;
  gap: 1rem 0;
  margin-top: 2rem;
}
p {
  color: #000;
  font-size: 13px;
  font-style: normal;
  font-weight: 400;
  line-height: normal;
}
.countdown {
  color: #666;
  font-style: italic;
}
h2 {
  font-size: 22px;
}
</style>
