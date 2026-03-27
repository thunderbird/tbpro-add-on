// stores/auth-store.js

import { useApiStore, useConfigStore } from '@send-frontend/stores';
import { User, UserManager, UserManagerSettings } from 'oidc-client-ts';
import { defineStore } from 'pinia';

import {
  BRIDGE_PING,
  BRIDGE_READY,
  GET_PENDING_ADDON_TOKEN,
  OIDC_TOKEN,
  OIDC_USER,
  PENDING_ADDON_TOKEN_RESPONSE,
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
    console.info('isLoggedIn changed', newValue);
  });

  // ------- OIDC Authentication ------- //

  async function getOIDCUser() {
    try {
      const user = await userManager.getUser();
      return user;
    } catch (error) {
      console.error('Failed to get OIDC user:', error);
      return null;
    }
  }

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

  /**
   * Scenario B: Authenticate using a token set provided by the add-on.
   *
   * The add-on stores a full OIDC token set in browser.storage.local under
   * PENDING_ADDON_TOKEN, then opens the /addon-auth page. This method reads
   * that token set, constructs a User, authenticates with the backend, and
   * notifies the background script to keep its state in sync.
   */
  async function authenticateWithAddonToken() {
    // 1. Request the pending token set from the background script via the
    //    token-bridge. The /addon-auth page runs as a normal web tab, so
    //    browser.storage.local is not available here — we use message passing.
    const tokenSet = await new Promise<{
      refresh_token: string;
      access_token?: string;
      id_token?: string;
      expires_at?: number;
      scope?: string;
    } | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Timed out waiting for pending addon token'));
      }, 5000);

      function handler(e: MessageEvent) {
        if (
          e.origin === window.location.origin &&
          e.data?.type === PENDING_ADDON_TOKEN_RESPONSE
        ) {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve(e.data.tokenSet ?? null);
        }
      }

      window.addEventListener('message', handler);
      window.postMessage(
        { type: GET_PENDING_ADDON_TOKEN },
        window.location.origin
      );
    });

    if (!tokenSet?.refresh_token) {
      throw new Error('No pending addon token found in storage');
    }

    let user: User;

    if (tokenSet.access_token && tokenSet.id_token) {
      // 2a. Full token set available — decode the id_token payload to build
      //     the User directly without a network round-trip.
      const idTokenPayload = JSON.parse(
        atob(
          tokenSet.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
        )
      );

      user = new User({
        access_token: tokenSet.access_token,
        refresh_token: tokenSet.refresh_token,
        id_token: tokenSet.id_token,
        token_type: 'Bearer',
        scope: tokenSet.scope ?? 'openid profile email offline_access',
        expires_at: tokenSet.expires_at ?? idTokenPayload.exp,
        profile: idTokenPayload,
      });

      await userManager.storeUser(user);
    } else {
      // 2b. Only a refresh token is available (e.g. from AccountHub).
      //     Store a minimal expired User so signinSilent picks up the
      //     refresh_token and exchanges it for a full token set.
      await userManager.storeUser(
        new User({
          access_token: '',
          token_type: 'Bearer',
          refresh_token: tokenSet.refresh_token,
          scope: tokenSet.scope ?? 'openid profile email offline_access',
          expires_at: 0, // force expired so silent renew triggers
          profile: {
            sub: '',
            iss: settings.authority ?? '',
            aud: settings.client_id ?? '',
            exp: 0,
            iat: 0,
          },
        })
      );

      user = await userManager.signinSilent();
    }

    currentUser.value = user;

    // 5. Notify the background script so it stores STORAGE_KEY_AUTH and
    //    sets up the Thundermail account (mirrors handleOIDCCallback).
    window.postMessage(
      {
        type: OIDC_TOKEN,
        token: user.refresh_token,
        email: user.profile.preferred_username ?? user.profile.email,
        name: user.profile.name ?? user.profile.given_name,
      },
      window.location.origin
    );

    window.postMessage({ type: OIDC_USER, user }, window.location.origin);

    // 7. Authenticate with the backend (same as handleOIDCCallback).
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
    getOIDCUser,
    authenticateWithAddonToken,
  };
});
