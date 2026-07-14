import { GET_LOGIN_STATE, LOGIN_STATE_RESPONSE } from '@send-frontend/lib/const';
import { pullBridgedPassphrase } from '@send-frontend/lib/bridgePassphrase';
import { dbUserSetup } from '@send-frontend/lib/helpers';
import init from '@send-frontend/lib/init';
import { validateToken } from '@send-frontend/lib/validations';
import {
  useApiStore,
  useAuthStore,
  useExtensionStore,
  useFolderStore,
  useKeychainStore,
  useStatusStore,
  useUserStore,
} from '@send-frontend/stores';
import useMetricsStore from '@send-frontend/stores/metrics';
import { useQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';

export function useSendConfig() {
  const userStore = useUserStore();
  const { keychain } = useKeychainStore();
  const { api } = useApiStore();
  const folderStore = useFolderStore();
  const { validators } = useStatusStore();
  const { configureExtension } = useExtensionStore();
  const { initializeClientMetrics } = useMetricsStore();
  const authStore = useAuthStore();
  const { isLoggedIn } = storeToRefs(authStore);

  /**
   * Pulls a passphrase shared from the web app via the token bridge into the
   * keychain (delegates to pullBridgedPassphrase). Called before the login
   * checks in loadLogin so the passphrase is present when keys are restored.
   */
  const checkAndTransferBridgeMessage = async () => {
    return pullBridgedPassphrase(keychain);
  };
  // Set up listener for bridge message transfer trigger
  try {
    browser.runtime.onMessage.addListener(async (message) => {
      if (message.type === 'TRANSFER_BRIDGE_MESSAGE') {
        console.log('📨 Received transfer trigger from background');
        await loadLogin();
      }
      return false;
    });
  } catch {
    // browser.runtime not available in non-extension context
    console.log('ℹ️ Running in non-extension context');
  }
  const loadLogin = async () => {
    await checkAndTransferBridgeMessage();
    // Check for data inconsistencies between local storage and api
    const { hasForcedLogin } = await validators();
    if (hasForcedLogin) {
      // If we don't have a session, show the login button.
      isLoggedIn.value = false;
      return false;
    }

    // check local storage first
    await userStore.loadFromLocalStorage();

    try {
      // See if we already have a valid session.
      // If so, hydrate our user using session data.
      const didPopulate = await userStore.populateFromBackend();
      if (!didPopulate) {
        return false;
      }
      // app-sepcific initialization
      await init(userStore, keychain, folderStore);
      await finishLogin();
    } catch (e) {
      console.log(e);
    }

    // Identify user for analytics
    const uid = userStore?.user?.uniqueHash;
    initializeClientMetrics(uid);
    return true;
  };

  async function finishLogin() {
    const isSessionValid = await validateToken(api);
    if (!isSessionValid) {
      console.error('Session is not valid');
      return;
    }

    await dbUserSetup(userStore, keychain, folderStore);
    const { isTokenValid, hasBackedUpKeys } = await validators();

    if (isTokenValid && hasBackedUpKeys) {
      try {
        await configureExtension();
      } catch (error) {
        console.warn('You are running this outside TB', error);
      }
    }

    console.log('isTokenValid', isTokenValid);
    isLoggedIn.value = true;
  }

  const useLoginQuery = () => {
    return useQuery({
      queryKey: ['getLoginStatus'],
      queryFn: async () => await loadLogin(),
      refetchOnWindowFocus: 'always',
      refetchOnMount: true,
      refetchOnReconnect: true,
    });
  };

  const clearSendStorage = async () => {
    try {
      localStorage.clear();
      console.log('✅ Cleared Send localStorage');
    } catch (error) {
      console.error('Error clearing Send localStorage:', error);
    }
  };

  /**
   * Queries the addon's login state via bidirectional message passing.
   * Returns a promise that resolves with the login state or times out after 5 seconds.
   * @returns Promise<{isLoggedIn: boolean, username: string | null}>
   */
  const queryAddonLoginState = (): Promise<{
    isLoggedIn: boolean;
    username: string | null;
  }> => {
    return new Promise((resolve, reject) => {
      // Guards against the token-bridge content script being absent or
      // unresponsive (e.g. the page is open outside of Thunderbird, or the
      // add-on isn't installed). Without this the promise — and any router
      // guard awaiting it — would hang forever.
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for addon login state'));
      }, 5000);

      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === LOGIN_STATE_RESPONSE) {
          cleanup();
          resolve({
            isLoggedIn: event.data.isLoggedIn,
            username: event.data.username,
          });
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        window.removeEventListener('message', messageHandler);
      };

      // Listen for response from addon
      window.addEventListener('message', messageHandler);

      // Send request to addon via token-bridge
      window.postMessage({ type: GET_LOGIN_STATE }, window.location.origin);
    });
  };

  return {
    /**
     * Loads and validates user login state from local storage and backend.
     * On success, initializes app state and configures the extension.
     * Sets isLoggedIn to false if forced login is required.
     */
    loadLogin,
    /**
     * Completes the login process by validating the session token,
     * setting up the database user, validating credentials, and configuring
     * the extension if running in Thunderbird environment.
     */
    finishLogin,
    /**
     * Vue Query composable for managing login status.
     * Automatically refetches on window focus, mount, and reconnect.
     */
    useLoginQuery,
    /**
     * Pulls a passphrase shared from the web app via the token bridge into the
     * keychain (delegates to pullBridgedPassphrase).
     */
    checkAndTransferBridgeMessage,
    /**
     * Clears Send-related data from localStorage.
     */
    clearSendStorage,
    /**
     * Queries the addon's login state via bidirectional message passing.
     * Returns a promise that resolves with the login state or times out after 5 seconds.
     */
    queryAddonLoginState,
  };
}
