<script setup lang="ts">
import { logger } from '@thunderbirdops/services-utils';

import { ref } from 'vue';
const emit = defineEmits(['openLoginPopup']);
const authUrl = ref('');

async function openLoginPopup() {
  emit('openLoginPopup', authUrl.value);
}

async function loginToMozAccount() {
  const resp = await fetch(`${import.meta.env.VITE_API_URL}/auth/fxa_login`, {
    mode: 'cors',
    credentials: 'include', // include cookies
  });
  const data = await resp.json();
  if (data.url) {
    authUrl.value = data.url;
    openLoginPopup();
  }
}
</script>

<template>
  <div class="login-page">
    <h3>Log into your Mozilla Account</h3>
    <button @click="loginToMozAccount">Log in</button>
  </div>
</template>

<style scoped>
header,
main {
  display: block;
}

h3 {
  margin-top: 2.2rem;
}

li b {
  font-weight: bolder;
}
</style>
