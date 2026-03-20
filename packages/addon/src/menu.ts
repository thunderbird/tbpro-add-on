import { BASE_URL } from '@send-frontend/apps/common/constants';
import { getEnvName } from '@send-frontend/lib/clientConfig';
import { STORAGE_KEY_AUTH } from '@send-frontend/lib/const';
import { APPOINTMENT_URL } from '@send-frontend/apps/common/constants';

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
  // Update root menu to display username instead of sign-in prompt
  await browser.TBProMenu.update(MENU_ACTIONS.ROOT, {
    title: '',
    secondaryTitle: username,
    tooltip: browser.i18n.getMessage('menuSignedInTooltip'),
  });

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

  // Clear all extension storage
  await browser.storage.local.clear();

  // Clear localStorage (if running in a context that has access to it)
  try {
    localStorage.clear();
    console.log('✅ Cleared localStorage');
  } catch {
    console.log('ℹ️ localStorage not available in this context');
  }

  console.log('✅ Cleared extension storage');

  // Open logout page to complete sign-out process
  await browser.tabs.create({
    url: `${BASE_URL}/logout`,
  });
}

async function closeAllTbProTabs() {
  const openWindows = await browser.windows.getAll({ populate: true });

  // Close all the tabs that are still open to the BASE_URL, as they may be in a bad state due to the expired token
  for (const window of openWindows) {
    for (const tab of window.tabs) {
      if (tab.url?.includes(`${BASE_URL}`)) {
        try {
          await browser.tabs.remove(tab.id!);
          console.log(`Closed expired session tab with id ${tab.id}`);
        } catch {
          console.warn(`Could not close tab with id ${tab.id}`);
        }
      }
    }
  }
}

/* 
  Checks if the add-on is logged in, this is separate from the web context.
  It's useful for the web context to figure out if the add-on is logged in or not, and also for the add-on to check if the token is expired and log out if necessary.
 */
export async function getLoginState() {
  try {
    // Get the auth token from browser storage (this is a copy of the auth token stored in the web context, used to determine login state in the add-on context)
    const authStorageData = await browser.storage.local.get(STORAGE_KEY_AUTH);
    console.log(authStorageData);
    if (authStorageData[STORAGE_KEY_AUTH]) {
      // Check token expiration
      const expiration = authStorageData[STORAGE_KEY_AUTH]?.expires_at * 1000; // Convert to milliseconds
      const now = Date.now();
      console.log('Token expires in (s):', (expiration - now) / 1000);
      // If the token is expired, treat as logged out
      if (expiration && now >= expiration) {
        console.warn('Auth token is expired. Treating as logged out.');
        await closeAllTbProTabs();

        await browser.storage.local.remove(STORAGE_KEY_AUTH);
        await menuLogout();
        return { isLoggedIn: false, username: null };
      }

      const username =
        authStorageData[STORAGE_KEY_AUTH]?.profile?.preferred_username ||
        authStorageData[STORAGE_KEY_AUTH]?.profile?.email;

      if (username) {
        await menuLoggedIn({ username });
        return { isLoggedIn: true, username };
      }
    }
    return { isLoggedIn: false, username: null };
  } catch (error) {
    console.error('Error retrieving auth state from storage:', error);
    return { isLoggedIn: false, username: null };
  }
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
  // Register onInstalled handler to open BASE_URL on extension install/update
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
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
