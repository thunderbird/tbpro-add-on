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
   * @deprecated Use isThunderbirdHost instead
   */
  const isExtension = computed(() => {
    return location.href.includes('moz-extension:');
  });

  const isTbproExtension = computed(() => {
    return __APP_NAME__ === 'tbpro';
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
  };
});

export type ConfigStore = ReturnType<typeof useConfigStore>;
