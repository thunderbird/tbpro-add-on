import { UserStore } from '@/stores/user-store';
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
  };

  validations.hasLocalStorageSession = validateLocalStorageSession(userStore);

  validations.isTokenValid = await validateToken(api);

  validations.hasBackedUpKeys = await validateBackedUpKeys(
    userStore.getBackup,
    keychain
  );
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
