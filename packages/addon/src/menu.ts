import { BASE_URL } from '@send-frontend/apps/common/constants';
import { getEnvName } from '@send-frontend/lib/clientConfig';
import { STORAGE_KEY_AUTH } from '@send-frontend/lib/const';
import { APPOINTMENT_URL } from '@send-frontend/apps/common/constants';
import { shouldAutoOpenLoginOnInstall } from './installGate';

// Determine environment-specific URLs
const environmentName = getEnvName();
const isProd = environmentName === 'production';
/** URL for Thunderbird Pro account dashboard (switches between staging and production) */
const THUNDERBIRD_ACCOUNTS_URL = `https://accounts${!isProd ? '-stage' : ''}.tb.pro/dashboard`;

/**
 * Available menu actions that can be triggered via the TBPro menu system.
 * Use these constants to ensure type safety and discoverability.
 */
export const MENU_ACTIONS = {
  ROOT: 'root',
  LOGOUT: 'logout',
  MANAGE_DASHBOARD: 'manageDashboard',
  MANAGE_SEND: 'manageSend',
  OPEN_APPOINTMENT: 'openAppointment',
} as const;

export type MenuAction = (typeof MENU_ACTIONS)[keyof typeof MENU_ACTIONS];

let loginTabId = null;

/**
 * The username the app menu is currently rendered for, or null when the menu is
 * in its signed-out state.
 *
 * getLoginState() runs every 60 seconds (and on every Send route change), and it
 * calls menuLoggedIn() to keep the menu in step with the stored session.
 * TBProMenu.create() rejects an id that already exists, so rebuilding the
 * submenu on every tick threw "Menu item manageDashboard already exists" once a
 * minute -- which getLoginState() then mistook for a failed session read and
 * reported as signed out (see #1120). Tracking what the menu already shows means
 * we only touch it when the signed-in state actually changed.
 */
let menuUsername: string | null = null;

/**
 * The menu rebuild currently in flight, or null when none is running.
 *
 * Sign-in arrives from several directions at once -- init() starts a login check
 * without waiting for it while background's main() awaits its own, and the
 * sign-in message handlers call menuLoggedIn() directly -- so two callers can
 * find the menu unbuilt at the same moment. They share one rebuild rather than
 * both adding the same items and colliding.
 */
let menuBuild: Promise<void> | null = null;

/**
 * Opens the login page in a new tab when user clicks the root menu item.
 * Includes extension flag to enable proper authentication flow.
 */
async function menuLogin() {
  const loginTab = await browser.tabs.create({
    url: `${BASE_URL}/login?isExtension=true`,
  });

  loginTabId = loginTab.id;
}

/**
 * Opens the Thunderbird Pro account dashboard in a new tab.
 * Users can manage their account settings, subscriptions, and profile here.
 */
async function menuManageDashboard() {
  await browser.tabs.create({
    url: THUNDERBIRD_ACCOUNTS_URL,
  });
}

/**
 * Opens the Thunderbird Send application in a new tab.
 * Users can access their files and manage Send settings.
 */
async function menuManageSend() {
  await browser.tabs.create({
    url: `${BASE_URL}/send/profile?showDashboard=true`,
  });
}

type Args = {
  username: string;
};

/**
 * Updates the menu to reflect logged-in state with user-specific options.
 * Shows username and adds menu items for managing dashboard, Send, and logout.
 */
export async function menuLoggedIn({ username }: Args) {
  // The menu already shows this user; there is nothing to rebuild.
  if (menuUsername === username) {
    return;
  }

  if (!menuBuild) {
    menuBuild = buildSignedInMenu(username).finally(() => {
      menuBuild = null;
    });
  }

  await menuBuild;
}

async function buildSignedInMenu(username: string) {
  // Update root menu to display username instead of sign-in prompt
  await browser.TBProMenu.update(MENU_ACTIONS.ROOT, {
    title: '',
    secondaryTitle: username,
    tooltip: browser.i18n.getMessage('menuSignedInTooltip'),
  });

  // Start from an empty submenu. The items below belong to whoever is signed in,
  // so anything left over -- from a different account, or from a rebuild that
  // failed part way through -- has to go before we re-add them. clear() on a
  // root with no children is a no-op, so this is safe on a first sign-in too.
  await browser.TBProMenu.clear(MENU_ACTIONS.ROOT);

  // Add submenu item to access Thunderbird Pro account dashboard
  await browser.TBProMenu.create(MENU_ACTIONS.MANAGE_DASHBOARD, {
    title: browser.i18n.getMessage('menuManageDashboard'),
    parentId: MENU_ACTIONS.ROOT,
  });

  // Add submenu item to access Thunderbird Send
  await browser.TBProMenu.create(MENU_ACTIONS.MANAGE_SEND, {
    title: browser.i18n.getMessage('menuManageSend'),
    parentId: MENU_ACTIONS.ROOT,
  });

  await browser.TBProMenu.create(MENU_ACTIONS.OPEN_APPOINTMENT, {
    title: browser.i18n.getMessage('menuOpenAppointment'),
    parentId: MENU_ACTIONS.ROOT,
  });

  // Add logout option at the bottom of the menu
  await browser.TBProMenu.create(MENU_ACTIONS.LOGOUT, {
    title: browser.i18n.getMessage('menuSignout'),
    parentId: MENU_ACTIONS.ROOT,
  });

  // Only claim the menu is built once every item is in place, so a failure part
  // way through is retried on the next check rather than left half-finished.
  menuUsername = username;
}

/**
 * Handles logout process by resetting menu to logged-out state and opening logout page.
 * Clears the username and removes authenticated menu items.
 * Also clears all localStorage and extension storage data.
 */
export async function menuLogout() {
  // Reset menu to display sign-in prompt
  await browser.TBProMenu.update(MENU_ACTIONS.ROOT, {
    title: browser.i18n.getMessage('menuSignInTo'),
    secondaryTitle: browser.i18n.getMessage('thunderbirdPro'),
    tooltip: '',
  });

  // Clear menu items
  console.log('🧹 Clearing menu items and storage');
  await browser.TBProMenu.clear('root');

  // The menu is back to its signed-out state, so the next sign-in has to rebuild
  // the submenu from scratch.
  menuUsername = null;

  // Full wipe of the add-on's storage to a clean, logged-out state.
  //
  // browser.storage.local is namespaced PER-EXTENSION (keyed to this add-on's
  // gecko id) -- it is NOT shared with Thunderbird core or any other add-on.
  // So every key in here is TB-Send's own: STORAGE_KEY_AUTH, the staged
  // passphrase (SEND_MESSAGE_TO_BRIDGE), the pending OIDC token set
  // (PENDING_ADDON_TOKEN), folder-lock records, cloud-file account configs, etc.
  //
  // On a genuine logout the product requirement is a clean wipe: auth token,
  // passphrase, and ALL other add-on data must be gone so the next launch
  // requires a fresh login. A scoped single-key remove() leaks the passphrase
  // and a live refresh token past logout (see #1023 / #1054). A concurrent
  // in-flight login (PENDING_ADDON_TOKEN) is intentionally cancelled here --
  // logout wins over a half-finished login by design.
  //
  // This blanket clear() is ONLY reached from a genuine logout (menuLogout(),
  // driven by the LOGOUT menu action / the SIGN_OUT message). The read-only
  // getLoginState() probe (60s timer + route guard) MUST NOT reach this and
  // does not -- it only ever calls storage.local.get(). See #948/#949.
  await browser.storage.local.clear();

  // Clear localStorage (if running in a context that has access to it)
  try {
    localStorage.clear();
    console.log('✅ Cleared localStorage');
  } catch {
    console.log('ℹ️ localStorage not available in this context');
  }

  console.log('✅ Cleared extension storage');

  // Close any stale Send tabs left on the now-ended session, then open the
  // logout page (kept open so it can clear the web session).
  await closeAllAddOnTabs();

  // Open logout page to complete sign-out process
  await browser.tabs.create({
    url: `${BASE_URL}/logout`,
  });
}

// Close any tabs still pointing at the Send web app. Called only on genuine
// logout (menuLogout) — never from the getLoginState() probe (see #948/#949).
async function closeAllAddOnTabs() {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && tab.url?.startsWith(BASE_URL)) {
      try {
        await browser.tabs.remove(tab.id);
      } catch {
        console.warn(`Could not close Send tab with id ${tab.id}`);
      }
    }
  }
}

/*
  Checks if the add-on is logged in, this is separate from the web context.
  It's a read-only probe: it's called by the Send route guard (via GET_LOGIN_STATE)
  and by a 60s timer, so it MUST NOT have destructive side effects (closing tabs,
  wiping storage, forcing the menu to log out).

  Note on `expires_at`: that field is the short-lived OIDC *access token* expiry. An
  expired access token does NOT mean the session is over — the Send web app refreshes
  it transparently via userManager.signinSilent() using the refresh_token (see
  auth-store getAccessToken/checkAuthStatus). So login state is driven by the presence
  of a refresh_token, not by access-token expiry. Genuine logout flows through the
  SIGN_OUT message path, which calls menuLogout().
 */
export async function getLoginState() {
  let auth;
  try {
    // Get the auth token from browser storage (this is a copy of the auth token stored in the web context, used to determine login state in the add-on context)
    const authStorageData = await browser.storage.local.get(STORAGE_KEY_AUTH);
    auth = authStorageData[STORAGE_KEY_AUTH];
  } catch (error) {
    console.error('Error retrieving auth state from storage:', error);
    return { isLoggedIn: false, username: null };
  }

  if (!auth) {
    return { isLoggedIn: false, username: null };
  }

  const username = auth?.profile?.preferred_username || auth?.profile?.email;

  // A stored session with a refresh_token is logged in, even if the access
  // token's expires_at has lapsed — the web app will silently refresh it.
  if (!auth.refresh_token || !username) {
    return { isLoggedIn: false, username: null };
  }

  // Keeping the app menu in step is a display concern, and it is deliberately
  // outside the try/catch above: a menu that fails to update does not end the
  // session, so callers (the Send route guard) must never be told we are signed
  // out because of it. Reporting a live session as signed out was the visible
  // half of #1120.
  try {
    await menuLoggedIn({ username });
  } catch (error) {
    console.error('Could not update the Thunderbird Pro menu:', error);
  }

  return { isLoggedIn: true, username };
}

export async function closeLoginTab() {
  // Close the associated login tab, if any
  console.log(`[menu.ts] Attempting to close login tab with id ${loginTabId}`);
  if (loginTabId) {
    try {
      await browser.tabs.get(loginTabId);
      await browser.tabs.remove(loginTabId);
    } catch {
      console.warn(`Could not close login tab with id ${loginTabId}`);
    }
  }
}

// To make sure that the login state is in sync with the web context token, we run this every minute
function checkLoginStateOnInterval() {
  const CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
  setInterval(async () => {
    await getLoginState();
  }, CHECK_INTERVAL_MS);
}

/**
 * Initializes the TBPro menu system and sets up click event handlers.
 * Creates the root menu item and registers listeners for all menu actions.
 */
export function init() {
  // Register onInstalled handler to open the login page on first install — but
  // only for the regular (standalone) add-on. The built-in system add-on is
  // enabled by default for every user and must not make a startup network
  // connection on a fresh, never-signed-in profile (see installGate.ts).
  browser.runtime.onInstalled.addListener(async (details) => {
    if (shouldAutoOpenLoginOnInstall(details.reason, browser.runtime.id)) {
      await menuLogin();
    }
  });

  // Register click handler for all menu items
  browser.TBProMenu.onClicked.addListener(async (action) => {
    switch (action) {
      case MENU_ACTIONS.ROOT:
        // Root menu clicked - open login page
        await menuLogin();
        break;
      case MENU_ACTIONS.LOGOUT:
        // Logout clicked - handle sign out
        await menuLogout();
        break;
      case MENU_ACTIONS.MANAGE_DASHBOARD:
        // Open Thunderbird Pro account dashboard
        await menuManageDashboard();
        break;
      case MENU_ACTIONS.MANAGE_SEND:
        // Open Thunderbird Send application
        await menuManageSend();
        break;
      case MENU_ACTIONS.OPEN_APPOINTMENT:
        // Open Appointment page
        await browser.tabs.create({
          url: APPOINTMENT_URL,
        });
        break;
    }
  });

  // Create the root menu item with initial logged-out state
  browser.TBProMenu.create(MENU_ACTIONS.ROOT, {
    title: browser.i18n.getMessage('menuSignInTo'),
    secondaryTitle: browser.i18n.getMessage('thunderbirdPro'),
    tooltip: '',
  });

  // Technically this is an async function.
  // But we do not need to wait for it synchronously.
  getLoginState();

  // Start interval to check login state periodically
  checkLoginStateOnInterval();
}
