// stores/auth-store.js

import { User, UserManager, UserManagerSettings } from 'oidc-client-ts';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { formatLoginURL } from '../lib/helpers';
import { openPopup } from '../lib/login';
import useApiStore from './api-store';
import { useConfigStore } from './config-store';

const settings: UserManagerSettings = {
  authority: import.meta.env?.VITE_OIDC_ROOT_URL,
  client_id: import.meta.env?.VITE_OIDC_CLIENT_ID,
  redirect_uri: `${window.location.origin}/post-login`,
  // We explicitly set the logout redirect to web to avoid errors with the uri since it doesn't support moz-extension:// protocols
  post_logout_redirect_uri: `${import.meta.env?.VITE_SEND_CLIENT_URL}/logout`,
  response_type: 'code',
  scope: 'openid profile email',
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
    console.log('isLoggedIn changed', newValue);
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
          prompt: 'login',
          redirect_uri: `${window.location.origin}/post-login?isExtension=${isExtension}`,
        });
      } else {
        await userManager.signinRedirect({
          prompt: 'login',
        });
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

  // ------- Legacy Mozilla Account Support (for backward compatibility) ------- //

  async function loginToMozAccount({
    onSuccess,
  }: { onSuccess?: () => void } = {}) {
    const resp = await api.call(`lockbox/fxa/login`);
    const formattedUrl = formatLoginURL(resp.url);

    if (!resp.url) {
      console.error('No URL returned from login endpoint');
      return;
    }

    if (!isExtension && window) {
      window.open(formattedUrl);
      if (onSuccess) onSuccess();
    } else {
      await openPopup(formattedUrl, onSuccess);
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

    // Legacy Methods
    loginToMozAccount,
    loginToKeyCloak, // Alias for loginToOIDC
  };
});
