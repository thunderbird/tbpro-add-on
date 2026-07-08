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
  // Refresh on demand only (see refreshAccessToken). The library's background
  // auto-renew adds uncontrolled concurrent refreshes and falls back to an
  // iframe flow that cannot work inside Thunderbird, both of which surface as
  // spurious logouts.
  automaticSilentRenew: false,
  filterProtocolClaims: true,
  // Profile claims (preferred_username, email, name, given_name) already come
  // from the id_token with the profile+email scopes. Skipping the userinfo
  // call removes a post-refresh network round-trip that can fail inside
  // Thunderbird and reject an otherwise-successful token refresh.
  loadUserInfo: false,
};

const userManager = new UserManager(settings);

/**
 * OIDC error codes that mean the session is genuinely over — the refresh token
 * was revoked or has expired. Any other failure (network, timeout, userinfo)
 * is transient and must NOT drop the user out of a still-valid session.
 */
const GENUINE_AUTH_FAILURE_CODES = [
  'invalid_grant',
  'login_required',
  'session_expired',
];

function isGenuineAuthFailure(error: unknown): boolean {
  const code = (error as { error?: string } | null)?.error;
  return typeof code === 'string' && GENUINE_AUTH_FAILURE_CODES.includes(code);
}

// Ensures a forced logout (triggered by the x-logout header, #960) runs once
// even if several in-flight requests come back with the header at the same time.
let forcedLogoutInProgress = false;

export const useAuthStore = defineStore('auth', () => {
  const { api } = useApiStore();
  const { isExtension, isThunderbirdHost } = useConfigStore();

  const isLoggedIn = ref(false);
  const currentUser = ref<User | null>(null);

  watch(isLoggedIn, (newValue) => {
    console.info('isLoggedIn changed', newValue);
  });

  // ------- OIDC Authentication ------- //

  // Shared in-flight refresh promise. Concurrent callers (getAccessToken before
  // an API call, checkAuthStatus, the 60s add-on menu timer) reuse the same
  // signinSilent() rather than firing overlapping refreshes — with refresh-token
  // rotation, every extra concurrent refresh races the others and loses with
  // invalid_grant, which reads as a spurious logout.
  let inFlightRefresh: Promise<User | null> | null = null;

  /**
   * Notify the add-on background that the session is over so its menu reverts
   * to logged-out. Only meaningful inside Thunderbird, where the token-bridge
   * content script forwards window messages to background.ts — the same path
   * UserMenu.vue uses on explicit logout.
   */
  function notifyAddonSignedOut() {
    if (!isThunderbirdHost) return;
    try {
      window.postMessage({ type: SIGN_OUT }, window.location.origin);
    } catch (error) {
      console.error('Failed to notify add-on of sign-out:', error);
    }
  }

  /**
   * Refresh the access token via the refresh_token, deduping concurrent callers.
   *
   * Returns the refreshed User on success. On a genuine auth failure (refresh
   * token revoked/expired) it clears local login state, notifies the add-on,
   * and returns null. On a transient failure (network/timeout) it leaves the
   * session intact and returns null so a later call can retry — we do not log
   * the user out over a blip.
   */
  async function refreshAccessToken(): Promise<User | null> {
    if (inFlightRefresh) return inFlightRefresh;

    inFlightRefresh = (async () => {
      try {
        const user = await userManager.signinSilent();
        currentUser.value = user;
        // Persist the freshly-rotated token so the extension popup's next cold
        // start reads a current token instead of a stale one.
        if (isExtension && user) {
          await browser.storage.local.set({ [STORAGE_KEY_AUTH]: user });
        }
        return user;
      } catch (error) {
        if (isGenuineAuthFailure(error)) {
          console.warn(
            `Silent token refresh failed — session ended (${
              (error as { error?: string }).error
            }). Signing out.`
          );
          isLoggedIn.value = false;
          currentUser.value = null;
          notifyAddonSignedOut();
        } else {
          // Transient failure: keep the session and let a later call retry.
          console.warn(
            'Silent token refresh hit a transient error; keeping session:',
            error
          );
        }
        return null;
      } finally {
        inFlightRefresh = null;
      }
    })();

    return inFlightRefresh;
  }

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
   * Web to add-on — Step 2: Start the OIDC login process.
   *
   * Redirects the browser (or extension popup) to accounts.tb.pro.
   * The OIDC provider authenticates the user and redirects back to
   * /post-login (or /post-login?isExtension=true) with an authorization code.
   *
   * Web flow  : redirect_uri = <origin>/post-login
   * Extension : redirect_uri = <origin>/post-login?isExtension=true
   *             The isExtension flag is read by PostLoginPage / the router
   *             guard after login to skip the key-backup prompt.
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
   * Web to add-on — Steps 5–8: Handle the OIDC redirect callback.
   *
   * Called by PostLoginPage.vue after accounts.tb.pro redirects back to
   * /post-login with an authorization code in the URL.
   *
   * Step 5 — Token exchange:
   *   signinCallback() reads the code from the URL and exchanges it with
   *   the OIDC token endpoint for access_token, refresh_token, and id_token.
   *
   * Step 6 — Notify the background script via the token-bridge:
   *   Because this page runs as a normal web tab, we cannot call
   *   browser.runtime.sendMessage() directly. Instead we use window.postMessage
   *   and rely on token-bridge.js (a content script injected into every tab)
   *   to forward the messages to background.ts.
   *   • OIDC_TOKEN  → background creates/updates the Thundermail mail account
   *                   using the refresh token as the OAuth2 credential.
   *   • OIDC_USER   → background stores the full User object in
   *                   browser.storage.local[STORAGE_KEY_AUTH] so the add-on
   *                   popup/menu can read it back via loadUser().
   *
   * Step 7 — Update background state (handled by background.ts, see there).
   *
   * Step 8 — Authenticate with the backend:
   *   POSTs the access_token as a Bearer token to auth/oidc/authenticate.
   *   The backend introspects it against the OIDC provider, finds or creates
   *   the user record, and responds with httpOnly JWT session cookies that
   *   all subsequent API calls use.
   */
  async function handleOIDCCallback() {
    try {
      const user = await userManager.signinCallback();
      currentUser.value = user;

      // Step 6a — Ping the bridge to confirm the content script is active.
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

      // Step 6b — Send the refresh token to the background so it can create
      // or update the Thundermail mail account (OAuth2 password grant).
      window.postMessage(
        {
          type: OIDC_TOKEN,
          token: user.refresh_token,
          email: user.profile.preferred_username,
          name: user.profile.name || user.profile.given_name,
        },
        window.location.origin
      );

      // Step 6c — Send the full User object so the background can persist it
      // in browser.storage.local[STORAGE_KEY_AUTH]. This is how the extension
      // popup and other web pages share auth state without going through the
      // OIDC provider again (see loadUser()).
      window.postMessage(
        {
          type: OIDC_USER,
          user: user,
        },
        window.location.origin
      );

      // Step 8 — Authenticate with the backend.
      // The backend introspects the access_token, finds or creates the user,
      // and sets httpOnly JWT session cookies used by all subsequent API calls.
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

      let user = await userManager.getUser();

      // If the stored access token has expired (common when the extension is
      // reopened after being idle for longer than the token lifetime, typically
      // ~5 minutes), attempt a silent refresh using the refresh_token before
      // giving up. refreshAccessToken() handles state/notification on genuine
      // failure and preserves the session on transient errors.
      if (user?.expired) {
        user = await refreshAccessToken();
        if (!user) {
          return null;
        }
      }

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
   * Get the current access token for API requests.
   * Transparently refreshes the token if it has expired.
   */
  async function getAccessToken() {
    try {
      let user = await userManager.getUser();
      if (!user) return null;
      if (user.expired) {
        // Access token has expired — use the refresh_token to obtain a new one
        // rather than returning a stale value that will be rejected by every API.
        user = await refreshAccessToken();
      }
      return user?.access_token || null;
    } catch (error) {
      console.error('Failed to get access token:', error);
      return null;
    }
  }

  /**
   * Forced logout in response to the backend's x-logout header (#960): the
   * session was ended server-side (logout elsewhere, password change, admin
   * revoke). Clear local auth and return to a clean state. Deliberately does
   * NOT call the API (that path is what surfaced x-logout, so calling it again
   * would loop); it only clears client state and redirects.
   */
  async function handleForcedLogout() {
    if (forcedLogoutInProgress) {
      return;
    }
    forcedLogoutInProgress = true;

    isLoggedIn.value = false;
    currentUser.value = null;
    try {
      await userManager.removeUser();
    } catch {
      // best-effort — the session is already gone server-side
    }
    try {
      // Extension context stores the session; clear it if present.
      if (typeof browser !== 'undefined') {
        await browser.storage.local.remove(STORAGE_KEY_AUTH);
        browser.runtime.sendMessage({ type: SIGN_OUT });
      }
    } catch {
      // best-effort
    }
    // Ask the app UI to return to login. Dispatched as a window event rather
    // than importing the Vue router here: this store is also bundled into the
    // background script (vite.config.background.js has no Vue plugin), so
    // importing the router — which pulls in every .vue page — breaks that build.
    // The listener lives in the router module (app bundle only) and does a
    // client-side navigation that is safe in both the web app and the add-on
    // (moz-extension://), where a hard window.location path nav would not
    // resolve.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tbpro:force-logout'));
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
   * Silent refresh of the access token. Delegates to the deduped
   * refreshAccessToken(), which owns state/notification on genuine failure and
   * preserves the session on transient errors.
   */
  async function refreshToken() {
    const user = await refreshAccessToken();
    return user?.access_token ?? null;
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
   * Add-On to Web — Steps 3–8: Authenticate using a token set provided by the add-on.
   *
   * Called by AddonAuthPage.vue when the /addon-auth route loads. The add-on
   * already obtained an OIDC token set from accounts.tb.pro and staged it in
   * browser.storage.local via triggerAddonLogin(). Because this page runs as a
   * normal web tab, it cannot access browser.storage.local directly — instead
   * it requests the token via message-passing through the token-bridge content
   * script, then uses it to authenticate with the backend.
   *
   * Full flow (Add-On to Web):
   *  1.  background.ts – triggerAddonLogin() stores token, opens /addon-auth
   *  2.  AddonAuthPage.vue loads, calls this function
   *  3.  POST GET_PENDING_ADDON_TOKEN → token-bridge → background
   *  4.  background reads storage, responds with PENDING_ADDON_TOKEN_RESPONSE,
   *      then deletes the staging key
   *  5.  token-bridge forwards response → window.postMessage → Promise resolves
   *  6.  User object is reconstructed (or obtained via signinSilent)
   *  7.  OIDC_TOKEN + OIDC_USER are posted so the background keeps its own
   *      state in sync (Thundermail account setup, STORAGE_KEY_AUTH)
   *  8.  POST auth/oidc/authenticate — backend issues session cookies
   *  9.  AddonAuthPage posts SIGN_IN_COMPLETE → background closes tab
   */
  async function authenticateWithAddonToken() {
    // Step 3–5: Request the pending token set from the background via the
    // token-bridge using a one-time request/response pattern.
    //
    // Why message-passing instead of browser.storage.local?
    // This page runs as a normal browser tab (not inside the extension),
    // so the `browser` global is unavailable. Posting GET_PENDING_ADDON_TOKEN
    // causes the token-bridge content script to forward the request to the
    // background, which reads storage and sends PENDING_ADDON_TOKEN_RESPONSE
    // back. A 5-second timeout guards against the bridge not being present
    // (e.g. the page was opened outside of Thunderbird).
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
      // This happens if the page is opened directly (not via triggerAddonLogin)
      // or if the 5-second timeout fired before the bridge responded.
      throw new Error('No pending addon token found in storage');
    }

    let user: User;

    if (tokenSet.access_token && tokenSet.id_token) {
      // Step 6a — Full token set (access + refresh + id tokens).
      // Decode the id_token JWT payload (base64url) to extract profile claims.
      // No signature verification is needed here — the backend will introspect
      // the access_token. We only need the claims to build the User object.
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

      // The access_token may have already expired if there was a delay between
      // the add-on capturing the token set and this tab loading (e.g. the tab
      // was opened while Thunderbird was offline, or the token lifetime is short).
      // Refresh silently so we always hand a valid token to the backend.
      if (user.expired) {
        user = await userManager.signinSilent();
      }
    } else {
      // Step 6b — Refresh-token only (AccountHub path).
      // AccountHub's onAccountAdded event provides only a single OAuth2 token.
      // We store a minimal, intentionally-expired User so that signinSilent()
      // will immediately trigger a token refresh, exchanging the refresh_token
      // for a full access + id token set via the OIDC token endpoint.
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

    // Step 7: Notify the background so it mirrors its own auth state.
    // These are the same two messages that Web to add-on (handleOIDCCallback)
    // sends after a normal OIDC redirect login:
    //  • OIDC_TOKEN  → background creates/updates the Thundermail account
    //  • OIDC_USER   → background stores the full User under STORAGE_KEY_AUTH
    //                   so the add-on popup/menu can read it back later
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

    // Step 8: Authenticate with the backend.
    // Sends the access_token as a Bearer token. The backend introspects it
    // against the OIDC provider, then issues its own httpOnly JWT session
    // cookies that the rest of the app uses for API calls.
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
    handleForcedLogout,
    refreshToken,
    loginToKeyCloak, // Alias for loginToOIDC

    // add-on specific
    loadUser,
    getOIDCUser,
    authenticateWithAddonToken,
  };
});
