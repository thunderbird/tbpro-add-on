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

export function useSendConfig() {
  const userStore = useUserStore();
  const { keychain } = useKeychainStore();
  const { api } = useApiStore();
  const folderStore = useFolderStore();
  const { validators } = useStatusStore();
  const { configureExtension } = useExtensionStore();
  const { initializeClientMetrics, sendMetricsToBackend } = useMetricsStore();
  const { isLoggedIn } = useAuth();

  const loadLogin = async () => {
    // Check for data inconsistencies between local storage and api
    const { hasForcedLogin } = await validators();
    if (hasForcedLogin) {
      // If we don't have a session, show the login button.
      isLoggedIn.value = false;
      return;
    }

    // check local storage first
    await userStore.loadFromLocalStorage();

    try {
      // See if we already have a valid session.
      // If so, hydrate our user using session data.
      const didPopulate = await userStore.populateFromBackend();
      if (!didPopulate) {
        return;
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
    await sendMetricsToBackend(api);
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
  return {
    loadLogin,
    finishLogin,
  };
}
