import { getEnvName } from '@send-frontend/lib/clientConfig';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useConfigStore = defineStore('config', () => {
  const environmentName = getEnvName();
  const isProd = environmentName === 'production';
  const isStaging = environmentName === 'staging';
  const isDev = environmentName === 'development';

  const isThunderbirdHost = computed(() => {
    // Theck if the User-Agent
    return navigator.userAgent.includes('Thunderbird');
  });

  /**
   * Check if the URL is a moz-extension:// URL
   * This is the case for addons/extensions running inside Thunderbird
   */

  const isExtension = computed(() => {
    return location.href.includes('moz-extension:');
  });

  /**
   * Checks if the name if the app is 'addon'
   * This is helpful to differentiate between the web app and the addon
   */
  const isTbproExtension = computed(() => {
    return __APP_NAME__ === 'addon';
  });

  const _serverUrl = ref(import.meta.env.VITE_SEND_SERVER_URL);
  const _isPublicLogin = ref(
    import.meta.env.VITE_ALLOW_PUBLIC_LOGIN === 'true'
  );

  const serverUrl = computed(() => _serverUrl.value);
  const isPublicLogin = computed(() => _isPublicLogin.value);

  function setServerUrl(url) {
    _serverUrl.value = url;
  }

  // Returns the addon id based on the server URL uses (ext-) to register cloudfile
  function getAddonId() {
    if (serverUrl.value.includes('send-backend.tb.pro')) {
      return 'ext-tbpro-add-on@thunderbird.net';
    } else {
      return 'ext-tbpro-addon-stage@thunderbird.net';
    }
  }

  async function openManagementPage() {
    try {
      await browser.runtime.openOptionsPage();
    } catch (error) {
      console.error('Failed to open management page:', error);
    }
  }

  return {
    isProd,
    isStaging,
    isDev,

    // Server
    serverUrl,
    setServerUrl,
    isPublicLogin,

    // Extension
    isExtension,
    isTbproExtension,
    isThunderbirdHost,
    getAddonId,
    openManagementPage,
  };
});

export type ConfigStore = ReturnType<typeof useConfigStore>;
