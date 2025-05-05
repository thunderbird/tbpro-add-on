<script setup lang="ts">
import ButtonComponent from 'send-frontend/src/apps/send/elements/BtnComponent.vue';
import LogOutButton from 'send-frontend/src/apps/send/elements/LogOutButton.vue';
import {
  useAuthStore,
  useConfigStore,
  useStatusStore,
  useUserStore,
} from 'send-frontend/src/stores';

const { loginToMozAccount } = useAuthStore();
const { logOut } = useUserStore();
const { validators } = useStatusStore();
const { isExtension } = useConfigStore();

const handleLogout = async () => {
  logOut();
  await validators();
  if (!isExtension) {
    location.reload();
  }
  window.location.reload();
};

async function finishLogin() {
  window.location.reload();

  console.warn('Refreshing page after login');
}

async function _loginToMozAccount() {
  loginToMozAccount(finishLogin);
}
</script>
<template>
  <h1>TB Pro login</h1>
  <ButtonComponent
    primary
    data-testid="login-button"
    @click.prevent="_loginToMozAccount"
    >Login</ButtonComponent
  >
  <log-out-button :log-out="handleLogout" />
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
