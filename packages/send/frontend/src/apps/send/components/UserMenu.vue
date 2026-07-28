<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { UserAvatar } from '@thunderbirdops/services-ui';
import { OIDC_USER, SIGN_OUT } from '@send-frontend/lib/const';
import { useAuth } from '@send-frontend/lib/auth';
import { useStatusStore, useUserStore } from '@send-frontend/stores';
import { useIsExtension } from '@send-frontend/composables/useIsExtension';
import {
  ACCOUNTS_URL,
  CONTACT_FORM_URL,
} from '@send-frontend/apps/common/constants';

defineProps<{
  username: string;
}>();

const { isRunningInsideThunderbird } = useIsExtension();
const { validators } = useStatusStore();
const { clearUserFromStorage } = useUserStore();
const { logOutAuth, refetchAuth } = useAuth();

const showMenu = ref(false);
const menuRef = useTemplateRef<HTMLElement>('menuRef');

const toggleMenu = () => {
  showMenu.value = !showMenu.value;
};

const handleClickOutside = (event: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    showMenu.value = false;
  }
};

const handleLogout = async () => {
  // If running inside Thunderbird, notify the background script about the logout via token bridge
  try {
    if (isRunningInsideThunderbird.value) {
      // Send logout message through token bridge to background.ts
      window.postMessage(
        {
          type: SIGN_OUT,
        },
        window.location.origin
      );
    }
  } catch (error) {
    console.error('Error during logout message sending:', error);
  }

  // Log out from the app and run validators to reset the app state
  try {
    await clearUserFromStorage();
    await logOutAuth();
    await validators();
  } catch (error) {
    console.error('Error during logout:', error);
  }
};

// Listen for inbound session-changed notifications relayed by token-bridge.js.
// When the session ends in another context (menu, web tab, AccountHub
// logout, etc.) background.ts broadcasts SIGN_OUT to all open tabs and the
// bridge forwards it to us as a window.postMessage -- re-running the local
// logout path keeps the page's "signed in" UI in sync without a reload.
// See https://github.com/thunderbird/tbpro-add-on/issues/1024.
const handleInboundMessage = async (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  const type = event.data?.type;
  if (type === SIGN_OUT) {
    try {
      await clearUserFromStorage();
      await logOutAuth();
      await validators();
    } catch (error) {
      console.error('Error handling inbound SIGN_OUT in UserMenu:', error);
    }
  } else if (type === OIDC_USER) {
    try {
      await refetchAuth();
    } catch (error) {
      console.error('Error handling inbound OIDC_USER in UserMenu:', error);
    }
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  window.addEventListener('message', handleInboundMessage);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
  window.removeEventListener('message', handleInboundMessage);
});
</script>

<template>
  <button ref="menuRef" class="user-menu">
    <user-avatar :username="username" class="avatar" @click="toggleMenu" />

    <div v-if="showMenu" class="dropdown">
      <a :href="ACCOUNTS_URL">Account</a>
      <a :href="CONTACT_FORM_URL">Support</a>
      <button @click.prevent="handleLogout">Logout</button>
    </div>
  </button>
</template>

<style scoped>
.user-menu {
  position: relative;
  display: inline-block;
  background: none;
  border: none;
  cursor: pointer;

  .avatar {
    & :first-child {
      color: var(--colour-ti-base-dark);
    }
  }

  .dropdown {
    position: absolute;
    right: 0;
    margin-top: 0.5rem;
    background: var(--colour-ti-base-light);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.2);
    padding: 0.5rem 0.25rem;
    min-width: 150px;

    a,
    button {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      color: white;
      text-decoration: none;
      padding: 0.75rem 0.375rem;
      font-family: metropolis;
      font-size: 0.6875rem;
      text-transform: uppercase;
      font-weight: 500;
      border-radius: 0.25rem;
      width: 100%;

      &:hover {
        background: rgba(255, 255, 255, 0.06);
      }
    }
  }
}
</style>
