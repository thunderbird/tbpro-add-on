<script setup lang="ts">
// import { useAuthStore } from 'send-frontend/src/stores';
import { useQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { useApiStore, useAuthStore } from 'send-frontend/src/stores';
import AdminPage from './AdminPage.vue';
import LoginPage from './pages/LoginPage.vue';

const authStore = useAuthStore();
const { api } = useApiStore();
const { isLoggedIn } = storeToRefs(authStore);

const { data: sessionData } = useQuery({
  queryKey: ['session'],
  queryFn: async () => {
    const resp = await api.call('users/me');
    if (resp.error) {
      isLoggedIn.value = false;
      return resp;
    }
    isLoggedIn.value = true;
    return resp;
  },
});

console.log('sessionData', sessionData.value);
</script>

<template>
  <LoginPage v-if="!isLoggedIn" />
  <AdminPage v-else />
</template>
