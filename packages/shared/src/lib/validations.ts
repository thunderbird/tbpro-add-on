import type { UserStoreType as UserStore } from '../stores/user-store';
import { UserType } from '../types';
import { ApiConnection } from './api';

import logger from '../logger';
import { Keychain, restoreKeysUsingLocalStorage } from './keychain';

export const validateToken = async (api: ApiConnection): Promise<boolean> => {
  try {
    // First try OIDC authentication if we have an access token
    try {
      const authStore = await import('../stores/auth-store').then((m) =>
        m.useAuthStore()
      );
      const accessToken = await authStore.getAccessToken();

      if (accessToken) {
        // Try OIDC validation
        const oidcResponse = await api.call(
          'auth/oidc/me',
          {},
          'GET',
          {
            Authorization: `Bearer ${accessToken}`,
          },
          { fullResponse: true }
        );

        if (oidcResponse?.ok) {
          return true;
        }

        // If OIDC token is invalid, try to refresh it
        console.log('OIDC token appears invalid, attempting refresh...');
        const newToken = await authStore.refreshToken();

        if (newToken) {
          // Retry with refreshed token
          const retryResponse = await api.call(
            'auth/oidc/me',
            {},
            'GET',
            {
              Authorization: `Bearer ${newToken}`,
            },
            { fullResponse: true }
          );
          return !!retryResponse?.ok;
        }
      }
    } catch (error) {
      console.debug('OIDC validation failed, falling back to JWT:', error);
    }

    // Fallback to legacy JWT validation
    const isTokenValid = await api.call(
      'auth/me',
      {},
      'GET',
      {},
      { fullResponse: true }
    );

    return !!isTokenValid;
  } catch (err) {
    console.error('Error validating session', err);
    return false;
  }
};

export const validateUser = async (
  api: ApiConnection
): Promise<{ user: UserType } | null> => {
  try {
    const userResponse = await api.call<{ user: UserType }>(`users/me`);
    if (userResponse?.user) {
      return userResponse;
    }
  } catch (error) {
    logger.error('Error validating user', error);
    return null;
  }
};

export const validateBackedUpKeys = async (
  getBackup: UserStore['getBackup'],
  keychain: Keychain
) => {
  const keybackup = await getBackup();
  const hasBackedUpKeys = keychain.getPassphraseValue();
  if (!keybackup || !hasBackedUpKeys) {
    return false;
  }
  return true;
};

/**
 * Checks local storage for a user object
 */
export const validateLocalStorageSession = ({ user }: UserStore) => {
  if (user?.id != undefined) return true;
  else return false;
};

export type useValidationArgs = {
  api: ApiConnection;
  userStore: UserStore;
  keychain: Keychain;
};

export const validator = async ({
  api,
  keychain,
  userStore,
}: useValidationArgs) => {
  const validations = {
    hasBackedUpKeys: false,
    hasLocalStorageSession: false,
    isTokenValid: false,
    hasCorrectKeys: false,
    // Flag used to force login
    hasForcedLogin: false,
  };

  let shouldClearSessionAndStorage = false;

  const userResponse = await validateUser(api);
  const userIDFromBackend = userResponse?.user?.id;
  const userIDFromStore = userStore?.user?.id;

  // Check that the passphrase in local storage is set correctly
  // If not done correctly, the user can lose access to their encrypted items
  // This can happen if a user restores their account while another client is logged in.
  // This will cause every key backup operation to fail and not sync properly.
  try {
    await restoreKeysUsingLocalStorage(keychain, api);
    validations.hasCorrectKeys = true;
  } catch {
    validations.hasCorrectKeys = false;
    shouldClearSessionAndStorage = true;
    logger.error('Incorrect passphrase. Removing local storage data.');
  }

  if (
    userIDFromStore &&
    userIDFromBackend &&
    userIDFromBackend !== userIDFromStore
  ) {
    // This check prevents data corruption if the user has local storage from a different user
    logger.error('User ID mismatch. Removing local storage data.');
    shouldClearSessionAndStorage = true;
  } else {
    validations.hasLocalStorageSession = validateLocalStorageSession(userStore);
    validations.isTokenValid = await validateToken(api);
    validations.hasBackedUpKeys = await validateBackedUpKeys(
      userStore.getBackup,
      keychain
    );
  }

  // Finally, if we should flush data, we will do so
  if (shouldClearSessionAndStorage) {
    await userStore.clearUserFromStorage();
    validations.hasForcedLogin = true;

    // Attempt to reload the page to ensure the user is redirected to the login page
    // This is a workaround to ensure the user is logged out and the app state is reset
    try {
      location.reload();
    } catch {
      console.warn('Failed to reload page');
    }
  }

  return validations;
};

export const validatePassword = (pass: string): boolean => {
  const hasMinLength = pass.length >= 12;
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
  const hasNumber = /\d/.test(pass);
  return hasMinLength && hasSpecialChar && hasNumber;
};

export const validateEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
