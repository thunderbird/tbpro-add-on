import logger from '@/logger';
import type { UserStoreType as UserStore } from '@/stores/user-store';
import { UserType } from '@/types';
import { ApiConnection } from './api';
import { MAX_ACCESS_LINK_RETRIES } from './const';
import { Keychain } from './keychain';
import { trpc } from './trpc';

export const validateToken = async (api: ApiConnection): Promise<boolean> => {
  try {
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
    // Flag used to force login
    hasForcedLogin: false,
  };

  // This check prevents data corruption if the user has local storage from a different user
  const userResponse = await api.call<{ user: UserType }>(`users/me`);

  const userIDFromBackend = userResponse?.user?.id;
  const userIDFromStore = userStore?.user?.id;

  if (userIDFromStore && userIDFromBackend !== userIDFromStore) {
    await userStore.clearUserFromStorage();
    validations.hasForcedLogin = true;
    logger.error('User ID mismatch. Removing local storage data.');
    try {
      location.reload();
    } catch {
      console.warn('Failed to reload page');
    }
  } else {
    validations.hasLocalStorageSession = validateLocalStorageSession(userStore);
    validations.isTokenValid = await validateToken(api);
    validations.hasBackedUpKeys = await validateBackedUpKeys(
      userStore.getBackup,
      keychain
    );
  }

  return validations;
};

export const getCanRetry = async (linkId: string) => {
  const { retryCount } = await trpc.getPasswordRetryCount.query({ linkId });
  if (retryCount >= MAX_ACCESS_LINK_RETRIES) {
    return false;
  }
  return true;
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
