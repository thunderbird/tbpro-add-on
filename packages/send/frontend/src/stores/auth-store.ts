// stores/auth-store.js

import logger from '@send-frontend/logger';
import { useApiStore } from '@send-frontend/stores';
import { User, UserManager, UserManagerSettings, IdTokenClaims } from 'oidc-client-ts';
import { defineStore } from 'pinia';

import { ref, watch } from 'vue';

interface RawAuthData extends User {
    // access_token and token_type are REQUIRED in the User class, so they remain required here.
    access_token: string;
    token_type: string;

    // as optional here to resolve the extension error.
    id_token?: string;
    scope?: string;
    expires_at?: number;

    // session_state is REQUIRED but nullable in the User class.
    session_state: string | null;

    // We use IdTokenClaims as defined in the User class source.
    profile: IdTokenClaims;

    refresh_token?: string; // Optional in base User class
}

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

      window.addEventListener('message', (e) => {
        if (
          e.origin === window.location.origin &&
          e.data?.type === 'TB/BRIDGE_READY'
        ) {
          console.log('[web app] bridge says: ready');
        }
      });

      // Send one tiny ping to the bridge.
      window.postMessage(
        { type: 'APP/PING', text: 'hello from auth store 👋' },
        window.location.origin
      );

      // Send the token for thundermail.
      window.postMessage(
        {
          type: 'TB/OIDC_TOKEN',
          token: user.refresh_token,
          email: user.profile.preferred_username,
          name: user.profile.name || user.profile.given_name,
        },
        window.location.origin
      );

      // Send the entire user for TB Send.
      window.postMessage(
        {
          type: 'TB/OIDC_USER',
          user: user
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

  /**
   * Save authenticated user data obtained from token bridge
   */
  async function storeUser(rawAuthData: RawAuthData) {
    try {
      if (!rawAuthData || !rawAuthData.access_token) {
        console.error("Invalid authentication data received from token bridge. Missing access_token.");
        return;
      }

      try {
        const userInstance = new User(rawAuthData);
        await userManager.storeUser(userInstance);

        console.log("User successfully stored via token bridge data.");

        // TODO: make sure Thunderbird also handles token renewal.
        // Otherwise, it will be logged out at some point because of Refresh Token Rotation.
        // After confirming that, we should do our own renewal here.
        // userManager.startSilentRenew();

      } catch (error) {
        console.error("Failed to store user with UserManager:", error);
      }

      isLoggedIn.value = true;
    } catch (error) {
      console.error('OIDC login from bridge failed:', error);
      throw error;
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
    storeUser, // Store auth data received from token bridge
    loginToKeyCloak, // Alias for loginToOIDC
  };
});
