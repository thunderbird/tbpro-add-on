import { BASE_URL } from '@send-frontend/apps/common/constants';
import { getEnvName } from '@send-frontend/lib/clientConfig';
import { STORAGE_KEY_AUTH } from '@send-frontend/lib/const';

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
} as const;

export type MenuAction = (typeof MENU_ACTIONS)[keyof typeof MENU_ACTIONS];

/**
 * Opens the login page in a new tab when user clicks the root menu item.
 * Includes extension flag to enable proper authentication flow.
 */
async function menuLogin() {
  await browser.tabs.create({
    url: `${BASE_URL}/login?isExtension=true`,
  });
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
    url: BASE_URL,
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

  // Add logout option at the bottom of the menu
  await browser.TBProMenu.create(MENU_ACTIONS.LOGOUT, {
    title: browser.i18n.getMessage('menuSignout'),
    parentId: MENU_ACTIONS.ROOT,
  });
}

/**
 * Handles logout process by resetting menu to logged-out state and opening logout page.
 * Clears the username and removes authenticated menu items.
 */
export async function menuLogout() {
  // Reset menu to display sign-in prompt
  await browser.TBProMenu.update(MENU_ACTIONS.ROOT, {
    title: browser.i18n.getMessage('menuSignInTo'),
    secondaryTitle: browser.i18n.getMessage('thunderbirdPro'),
    tooltip: '',
  });

  // TODO: Implement proper menu item cleanup
  console.log('🧹this should clear the menu items');
  await browser.TBProMenu.clear('root');
}

async function getLoginState() {
  const result = await browser.storage.local.get(STORAGE_KEY_AUTH);
  console.log(result);
  if (result[STORAGE_KEY_AUTH]) {
    const username =
      result[STORAGE_KEY_AUTH]?.profile?.preferred_username ||
      result[STORAGE_KEY_AUTH]?.profile?.email;
    if (username) {
      menuLoggedIn({ username });
    }
  }
}

/**
 * Initializes the TBPro menu system and sets up click event handlers.
 * Creates the root menu item and registers listeners for all menu actions.
 */
export function init() {
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
}
