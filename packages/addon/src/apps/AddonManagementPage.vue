<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import ButtonComponent from 'send-frontend/src/apps/send/elements/BtnComponent.vue';
import LogOutButton from 'send-frontend/src/apps/send/elements/LogOutButton.vue';
import {
  useApiStore,
  useAuthStore,
  useUserStore,
} from 'send-frontend/src/stores';
import AdminPage from './AdminPage.vue';

const { api } = useApiStore();
const authStore = useAuthStore();
const { isLoggedIn } = storeToRefs(authStore);
const { loginToMozAccount } = authStore;
const { logOut } = useUserStore();

const { data: sessionData, refetch } = useQuery({
  queryKey: ['session'],
  queryFn: async () => {
    const resp = await api.call('auth/me');
    if (resp.error) {
      isLoggedIn.value = false;
      return resp;
    }
    isLoggedIn.value = true;
    return resp;
  },
});

const handleLogout = async () => {
  logOut();
  isLoggedIn.value = false;
};

async function finishLogin() {
  await refetch();
}

async function _loginToMozAccount() {
  loginToMozAccount({ onSuccess: finishLogin });
}

console.log('sessionData', sessionData.value);
</script>

<template>
  <ButtonComponent
    v-if="!isLoggedIn"
    primary
    data-testid="login-button"
    @click.prevent="_loginToMozAccount"
    >Login</ButtonComponent
  >

  <log-out-button v-if="isLoggedIn" :log-out="handleLogout" />

  <AdminPage v-if="isLoggedIn" />
</template>

<style scoped>
.container {
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
</style>
