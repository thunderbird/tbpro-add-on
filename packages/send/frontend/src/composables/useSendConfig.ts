import { useAuth } from '@send-frontend/lib/auth';
import { dbUserSetup } from '@send-frontend/lib/helpers';
import init from '@send-frontend/lib/init';
import { validateToken } from '@send-frontend/lib/validations';
import {
  useApiStore,
  useExtensionStore,
  useFolderStore,
  useKeychainStore,
  useStatusStore,
  useUserStore,
} from '@send-frontend/stores';
import useMetricsStore from '@send-frontend/stores/metrics';
import { useQuery } from '@tanstack/vue-query';

export function useSendConfig() {
  const userStore = useUserStore();
  const { keychain } = useKeychainStore();
  const { api } = useApiStore();
  const folderStore = useFolderStore();
  const { validators } = useStatusStore();
  const { configureExtension } = useExtensionStore();
  const { initializeClientMetrics } = useMetricsStore();
  const { isLoggedIn } = useAuth();

  const loadLogin = async () => {
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
  };
}
