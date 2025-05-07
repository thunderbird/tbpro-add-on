<script setup lang="ts">
import ButtonComponent from 'send-frontend/src/apps/send/elements/BtnComponent.vue';
import LogOutButton from 'send-frontend/src/apps/send/elements/LogOutButton.vue';
import { useAuth } from 'send-frontend/src/lib/auth';
import {
  useAuthStore,
  useUserStore as useUserStoreSend,
} from 'send-frontend/src/stores';
import AdminPage from './AdminPage.vue';

const authStore = useAuthStore();
const { clearUserFromStorage: clearUser_send } = useUserStoreSend();
const { isLoggedIn, refetchAuth, logOutAuth } = useAuth();
const { loginToMozAccount } = authStore;

const handleLogout = async () => {
  await logOutAuth();
  await clearUser_send();
};

async function finishLogin() {
  await refetchAuth();
}

async function _loginToMozAccount() {
  loginToMozAccount({ onSuccess: finishLogin });
}
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
