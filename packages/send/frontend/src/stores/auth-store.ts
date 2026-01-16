// stores/auth-store.js

import logger from '@send-frontend/logger';
import { useApiStore, useConfigStore } from '@send-frontend/stores';
import { User, UserManager, UserManagerSettings } from 'oidc-client-ts';
import { defineStore } from 'pinia';

import {
  BRIDGE_PING,
  BRIDGE_READY,
  OIDC_TOKEN,
  OIDC_USER,
  SIGN_OUT,
  STORAGE_KEY_AUTH,
} from '@send-frontend/lib/const';
import { ref, watch } from 'vue';

const settings: UserManagerSettings = {
  authority: import.meta.env?.VITE_OIDC_ROOT_URL,
  client_id: import.meta.env?.VITE_OIDC_CLIENT_ID,
  redirect_uri: `${window.location.origin}/post-login`,
  // We explicitly set the logout redirect to web to avoid errors with the uri since it doesn't support moz-extension:// protocols
  post_logout_redirect_uri: `${import.meta.env?.VITE_SEND_CLIENT_URL}/logout`,
  response_type: 'code',
  scope: 'openid profile email offline_access',
  automaticSilentRenew: true,
  filterProtocolClaims: true,
  loadUserInfo: true,
};

const userManager = new UserManager(settings);

export const useAuthStore = defineStore('auth', () => {
  const { api } = useApiStore();
  const { isExtension } = useConfigStore();

  const isLoggedIn = ref(false);
  const currentUser = ref<User | null>(null);

  watch(isLoggedIn, (newValue) => {
    logger.info('isLoggedIn changed', newValue);
  });

  // ------- OIDC Authentication ------- //

  /**
   * Start the OIDC login process
   */
  async function loginToOIDC({
    onSuccess,
    isExtension,
  }: {
    onSuccess?: () => void;
    isExtension: boolean;
  }) {
    try {
      if (isExtension) {
        // For extensions, we might need to handle this differently
        // For now, use the same flow as web
        await userManager.signinRedirect({
          redirect_uri: `${window.location.origin}/post-login?isExtension=${isExtension}`,
        });
      } else {
        await userManager.signinRedirect();
      }

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('OIDC login failed:', error);
      throw error;
    }
  }

  /**
   * Handle the OIDC callback after authentication
   */
  async function handleOIDCCallback() {
    try {
      const user = await userManager.signinCallback();
      currentUser.value = user;

      window.addEventListener('message', (e) => {
        if (
          e.origin === window.location.origin &&
          e.data?.type === BRIDGE_READY
        ) {
          console.log('[web app] bridge says: ready');
        }
      });

      // Send one tiny ping to the bridge.
      window.postMessage(
        { type: BRIDGE_PING, text: 'hello from auth store 👋' },
        window.location.origin
      );

      // Send the token for thundermail via bridge.
      window.postMessage(
        {
          type: OIDC_TOKEN,
          token: user.refresh_token,
          email: user.profile.preferred_username,
          name: user.profile.name || user.profile.given_name,
        },
        window.location.origin
      );

      // Send the entire user for TB Send via bridge.
      window.postMessage(
        {
          type: OIDC_USER,
          user: user,
        },
        window.location.origin
      );

      // Send the access token to our backend to create/update user
      const response = await api.call('auth/oidc/authenticate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response?.user) {
        isLoggedIn.value = true;
        return response.user;
      } else {
        throw new Error('Backend authentication failed');
      }
    } catch (error) {
      console.error('OIDC callback handling failed:', error);
      throw error;
    }
  }

  /**
   * Check if user is currently authenticated and get user info
   */
  async function checkAuthStatus() {
    try {
      // Load user from stored auth data, if available.
      // No-op if we are not in the add-on.
      if (isExtension) {
        await loadUser();
      }

      const user = await userManager.getUser();

      if (user && !user.expired) {
        currentUser.value = user;

        // Validate with backend
        const response = await api.call('auth/oidc/me', {
          headers: {
            Authorization: `Bearer ${user.access_token}`,
          },
        });

        if (response?.user) {
          isLoggedIn.value = true;
          return response.user;
        }
      }

      isLoggedIn.value = false;
      currentUser.value = null;
      return null;
    } catch (error) {
      console.error('Auth status check failed:', error);
      isLoggedIn.value = false;
      currentUser.value = null;
      return null;
    }
  }

  /**
   * Get the current access token for API requests
   */
  async function getAccessToken() {
    try {
      const user = await userManager.getUser();
      return user?.access_token || null;
    } catch (error) {
      console.error('Failed to get access token:', error);
      return null;
    }
  }

  /**
   * Logout from OIDC and clear local state
   */
  async function logoutFromOIDC() {
    try {
      await api.call('auth/oidc/logout', {}, 'POST');
      await userManager.signoutRedirect();
    } catch (error) {
      console.error('OIDC logout failed:', error);
      // Even if OIDC logout fails, clear local state
      isLoggedIn.value = false;
      currentUser.value = null;
    } finally {
      // Remove stored auth data
      await browser.storage.local.remove(STORAGE_KEY_AUTH);

      // Let background.ts know that we have logged out.
      browser.runtime.sendMessage({
        type: SIGN_OUT,
      });
    }
  }

  /**
   * Silent refresh of the access token
   */
  async function refreshToken() {
    try {
      const user = await userManager.signinSilent();
      currentUser.value = user;
      return user.access_token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      // If silent refresh fails, user needs to re-authenticate
      isLoggedIn.value = false;
      currentUser.value = null;
      return null;
    }
  }

  async function loadUser() {
    // Always check for a stored user instead of getting it from
    // the userManager.
    // A stored user is how we coordinate the different parts of
    // the tb.pro add-on.
    try {
      const result = await browser.storage.local.get(STORAGE_KEY_AUTH);
      if (result[STORAGE_KEY_AUTH]) {
        const userInstance = new User(result[STORAGE_KEY_AUTH]);
        await userManager.storeUser(userInstance);
      } else {
        // If there is no user in storage, remove the one in memory.
        await userManager.removeUser();
        isLoggedIn.value = false;
        currentUser.value = null;
      }
    } catch (e) {
      console.log(`No error. Only works if running in add-on.`);
      console.log(e);
    }
  }

  // Legacy alias for backward compatibility
  const loginToKeyCloak = loginToOIDC;

  // This object must be flat so that we can use storeToRefs when we consume it
  return {
    // State
    isLoggedIn,
    currentUser,

    // OIDC Methods
    loginToOIDC,
    handleOIDCCallback,
    checkAuthStatus,
    getAccessToken,
    logoutFromOIDC,
    refreshToken,
    loginToKeyCloak, // Alias for loginToOIDC

    // add-on specific
    loadUser,
  };
});
