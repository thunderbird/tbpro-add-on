// stores/counter.js

import { formatLoginURL } from '@/lib/helpers';
import { openPopup } from '@/lib/login';
import { useApiStore, useConfigStore } from '@/stores';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const { api } = useApiStore();
  const { isExtension } = useConfigStore();
  // We check auth for each app individually

  // ------- Common for Addons ------- //
  async function loginToMozAccount(finishLogin: () => void) {
    const resp = await api.call(`lockbox/fxa/login`);
    const formattedUrl = formatLoginURL(resp.url);

    if (!resp.url) {
      console.error('No URL returned from login endpoint');
      return;
    }

    if (!isExtension && window) {
      window.open(formattedUrl);
      finishLogin();
    } else {
      await openPopup(formattedUrl, finishLogin);
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
