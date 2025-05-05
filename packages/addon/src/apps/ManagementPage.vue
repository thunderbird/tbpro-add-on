<script setup lang="ts">
// import { useAuthStore } from 'send-frontend/src/stores';
import AdminPage from './AdminPage.vue';
import LoginPage from './pages/LoginPage.vue';

// const {
//   send: {
//     status: { isLoggedIn },
//   },
// } = useAuthStore();
</script>

<template>
  <LoginPage />
  <AdminPage />
</template>
