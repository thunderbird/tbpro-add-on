// stores/counter.js

import { openPopup } from '@/lib/login';
import { useApiStore } from '@/stores';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const { api } = useApiStore();
  // We check auth for each app individually

  // ------- Common ------- //
  async function loginToMozAccount(finishLogin: () => void) {
    const resp = await api.call(`lockbox/fxa/login`);
    if (resp.url) {
      await openPopup(resp.url, finishLogin);
    }
  }

  // ------- Send ------- //
  const isLoggedIn = ref(false);

  // setters
  function setLoggedIn(value: boolean) {
    isLoggedIn.value = value;
  }

  // getters
  const _isLoggedIn = computed(() => isLoggedIn.value);
  return {
    loginToMozAccount,
    send: {
      status: {
        isLoggedIn: _isLoggedIn.value,
      },
      actions: {
        setLoggedIn,
      },
    },
  };
});
