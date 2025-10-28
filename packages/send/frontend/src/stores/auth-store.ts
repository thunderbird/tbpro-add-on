// stores/auth-store.js
import { formatLoginURL } from '@send-frontend/lib/helpers';
import { openPopup } from '@send-frontend/lib/login';
import { useApiStore, useConfigStore } from '@send-frontend/stores';
import { User, UserManager, UserManagerSettings } from 'oidc-client-ts';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

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
  // These values are hardcoded but we should be able to get them from the store
  const email = 'testuser@stage-thundermail.com';
  const hostname = 'mail.stage-thundermail.com';
  const password = '2JBxsEaeYwX7bXWWHY9X';
  const username = 'testuser@stage-thundermail.com';
  const realname = 'Alejandro Aspinwall';
  const emailAddress = email;
  const displayName = 'Thunderbird Pro Account';

  // Sample AccountConfig for Gmail IMAP account
  const sampleAccountConfig = {
    incoming: {
      type: 'imap',
      hostname,
      port: 993,
      username,
      password,
      socketType: 3, // SSL
      auth: 10, // OAuth2 (or use 3 for plain text if using App Password)
    },
    outgoing: {
      type: 'smtp',
      hostname,
      port: 465,
      username,
      password,
      socketType: 2, // STARTTLS
      auth: 10, // OAuth2 (or use 3 for plain text if using App Password)
      addThisServer: true, // Required: tells TB to create a new SMTP server
    },
    identity: {
      realname,
      emailAddress,
    },
    displayName: displayName + 'sampleAccountConfig',
  };

  // Alternative sample for a generic IMAP provider
  const genericIMAPConfig = {
    incoming: {
      type: 'imap',
      hostname,
      port: 993,
      username,
      // email,
      password,
      socketType: 3, // SSL
      auth: 3, // Plain text authentication
    },
    outgoing: {
      type: 'smtp',
      hostname,
      port: 587,
      // email,
      username,
      password,
      socketType: 2, // STARTTLS
      auth: 3, // Plain text authentication
      addThisServer: true, // Required: tells TB to create a new SMTP server
    },
    identity: {
      realname,
      emailAddress,
    },
    displayName: displayName + 'genericIMAPConfig',
  };

  // Sample using existing SMTP server (common in corporate environments)
  const reuseSmtpConfig = {
    incoming: {
      type: 'imap',
      hostname,
      username,
      port: 993,
      // email,
      password,
      socketType: 3, // SSL
      auth: 3, // Plain text
    },
    outgoing: {
      useGlobalPreferredServer: true, // This will use the existing default SMTP server
    },
    identity: {
      realname,
      emailAddress,
    },
    displayName: displayName + 'reuseSmtpConfig',
  };
  const accountData = {
    sampleAccountConfig,
    genericIMAPConfig,
    reuseSmtpConfig,
  };

  /**
   * Handle the OIDC callback after authentication
   */
  async function handleOIDCCallback() {
    try {
      const user = await userManager.signinCallback();
      currentUser.value = user;

      try {
        window.addEventListener('message', (e) => {
          if (
            e.origin === window.location.origin &&
            e.data?.type === 'TB/BRIDGE_READY'
          ) {
            console.log('[web app] bridge says: ready v2');
          }
        });
        // Send one tiny ping to the bridge.
        window.postMessage(
          { type: 'APP/PING', text: 'hello from auth store 👋', accountData },
          window.location.origin
        );
        // Send the token.
        window.postMessage(
          { type: 'TB/OIDC_TOKEN', token: user.access_token, accountData },
          window.location.origin
        );
      } catch (error) {
        console.error('Error sending message to bridge:', error);
      }

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
