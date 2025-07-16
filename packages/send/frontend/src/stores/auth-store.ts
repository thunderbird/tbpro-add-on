// stores/counter.js

import { formatLoginURL } from '@send-frontend/lib/helpers';
import { openPopup } from '@send-frontend/lib/login';
import { useApiStore, useConfigStore } from '@send-frontend/stores';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const { api } = useApiStore();
  const { isExtension } = useConfigStore();

  const isLoggedIn = ref(false);

  watch(isLoggedIn, (newValue) => {
    console.log('isLoggedIn changed', newValue);
  });

  // We check auth for each app individually

  // ------- Common for Addons ------- //
  async function loginToMozAccount({ onSuccess }: { onSuccess?: () => void }) {
    const resp = await api.call(`lockbox/fxa/login`);
    const formattedUrl = formatLoginURL(resp.url);

    if (!resp.url) {
      console.error('No URL returned from login endpoint');
      return;
    }

    if (!isExtension && window) {
      window.open(formattedUrl);
      onSuccess();
    } else {
      await openPopup(formattedUrl, onSuccess);
    }
  }

  // This object must be flat so that we can use storeToRefs when we consume it
  return {
    loginToMozAccount,
    isLoggedIn,
  };
});
