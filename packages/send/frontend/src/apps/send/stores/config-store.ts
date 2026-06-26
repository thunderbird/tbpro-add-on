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

  // Returns the cloudfile provider type (`ext-<extension id>`) used to register
  // and look up the cloud file account.
  //
  // Thunderbird registers the provider as `ext-` + the extension id declared in
  // the installed manifest (see CloudFileAccounts/implementation.js). Deriving
  // the value from `browser.runtime.id` at runtime keeps us in sync with
  // whatever id is actually installed — critically the system add-on build,
  // where the packaging step rewrites the manifest id to
  // `tbpro-system-add-on@thunderbird.net`. Hardcoding the prod id here would
  // produce `ext-tbpro-add-on@thunderbird.net`, which is not registered in the
  // system add-on and fails with "Cloud file provider ... is not registered".
  function getAddonId() {
    const runtimeId =
      typeof browser !== 'undefined' ? browser?.runtime?.id : undefined;
    if (runtimeId) {
      return `ext-${runtimeId}`;
    }

    // Fallback for non-extension contexts (web app / tests) where there is no
    // runtime id available.
    if (serverUrl.value.includes('send-backend.tb.pro')) {
      return 'ext-tbpro-add-on@thunderbird.net';
    } else {
      return 'ext-tbpro-addon-stage@thunderbird.net';
    }
  }

  async function openManagementPage() {
    // The system add-on no longer relies on the options page, so there is no
    // management page to open here.
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
