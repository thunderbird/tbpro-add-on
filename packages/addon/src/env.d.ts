/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TESTING?: string;
  readonly VITE_SEND_SERVER_URL?: string;
  readonly VITE_LOGGER_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Application version injected at build time by Vite.
 * @example "1.0.5"
 */
declare const __APP_VERSION__: string;

/**
 * Application name injected at build time by Vite.
 * @example "TBPro Add-on"
 */
declare const __APP_NAME__: string;

/**
 * Type declaration for Vue single-file components (SFC).
 * Allows TypeScript to recognize .vue file imports.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<
    Record<string, never>,
    Record<string, never>,
    never
  >;
  export default component;
}

/**
 * Extension to the WebExtensions browser API for TBPro custom menu functionality.
 * Provides methods to create, update, and manage custom menu items in Thunderbird.
 */
declare namespace browser {
  /**
   * Experiment API that fires when a new Thundermail account is added via
   * Thunderbird's Accounts Hub and an OIDC token is available for the account.
   */
  namespace AccountHub {
    interface AccountAddedDetail {
      /** The OAuth2 refresh token (OIDC token) retrieved from the Thunderbird login manager. */
      token: string;
      /** The email address of the newly added Thundermail account. */
      email: string;
      /** The display name (full name) of the account identity. */
      name: string;
    }

    /** Fires when a Thundermail account is added via the Accounts Hub and the OIDC token is ready. */
    const onAccountAdded: {
      addListener(
        callback: (detail: AccountAddedDetail) => Promise<void> | void
      ): void;
    };
  }

  namespace TBProMenu {
    /**
     * Creates a new menu item in the TBPro menu.
     * @param id - Unique identifier for the menu item
     * @param options - Configuration options for the menu item
     * @param options.title - Primary display text for the menu item
     * @param options.secondaryTitle - Optional secondary text (e.g., for keyboard shortcuts)
     * @param options.parentId - ID of parent menu item (for creating submenus)
     * @param options.tooltip - Tooltip text displayed on hover
     * @returns Promise that resolves when the menu item is created
     */
    function create(
      id: string,
      options: {
        title: string;
        secondaryTitle?: string;
        parentId?: string;
        tooltip?: string;
      }
    ): Promise<void>;

    /**
     * Updates an existing menu item's properties.
     * @param id - Unique identifier of the menu item to update
     * @param options - Properties to update (only provided properties will be changed)
     * @param options.title - New primary display text
     * @param options.secondaryTitle - New secondary text
     * @param options.tooltip - New tooltip text
     * @returns Promise that resolves when the menu item is updated
     */
    function update(
      id: string,
      options: {
        title?: string;
        secondaryTitle?: string;
        tooltip?: string;
      }
    ): Promise<void>;

    /**
     * Removes a menu item and all its children from the TBPro menu.
     * @param id - Unique identifier of the menu item to remove
     * @returns Promise that resolves when the menu item is cleared
     */
    function clear(id: string): Promise<void>;

    /**
     * Event fired when a TBPro menu item is clicked.
     */
    const onClicked: {
      /**
       * Registers a callback function to handle menu item click events.
       * @param callback - Function to execute when a menu item is clicked
       * @param callback.action - The ID of the clicked menu item
       */
      addListener(callback: (action: string) => Promise<void> | void): void;
    };
  }

  /**
   * Extension to the WebExtensions browser API for CloudFile account management.
   * Provides methods to create and manage cloud file storage accounts in Thunderbird.
   */
  namespace CloudFileAccounts {
    /**
     * Result returned when creating a cloud file account.
     */
    interface CreateAccountResult {
      /** Whether the account creation was successful */
      success: boolean;
      /** Account ID if the account was created or already exists */
      accountId?: string;
      /** Whether the account already existed */
      alreadyExists?: boolean;
      /** Success or informational message */
      message?: string;
      /** Error message if the operation failed */
      error?: string;
    }

    /**
     * Creates a new cloud file account for the extension.
     * If an account with the same type already exists, returns the existing account.
     *
     * @param type - The provider type identifier (typically "ext-" followed by extension ID)
     * @param configured - Whether the account should be marked as configured
     * @returns Promise that resolves with the result of the account creation
     *
     * @example
     * ```typescript
     * const result = await browser.CloudFileAccounts.createAccount(
     *   'ext-myextension@example.com',
     *   true
     * );
     * if (result.success) {
     *   console.log('Account ID:', result.accountId);
     * }
     * ```
     */
    function createAccount(
      type: string,
      configured: boolean
    ): Promise<CreateAccountResult>;

    /**
     * Result returned when toggling the provider's registration.
     */
    interface ProviderRegistrationResult {
      /** Whether the operation was successful */
      success: boolean;
      /** True if the provider was already registered */
      alreadyRegistered?: boolean;
      /** True if the provider was not registered to begin with */
      alreadyUnregistered?: boolean;
      /** Error message if the operation failed */
      error?: string;
    }

    /**
     * Re-registers the Send cloud file provider (the instance Thunderbird
     * created from the manifest `cloud_file` key) so it appears in the provider
     * list. Idempotent. Called on sign-in.
     */
    function registerProvider(): Promise<ProviderRegistrationResult>;

    /**
     * Unregisters the Send cloud file provider so it is hidden from the provider
     * list while the user is signed out. Idempotent. The provider instance is
     * retained internally for re-registration on sign-in.
     */
    function unregisterProvider(): Promise<ProviderRegistrationResult>;
  }

  /**
   * Experiment API exposing Thunderbird's telemetry opt-out preference
   * (datareporting.healthreport.uploadEnabled) so the add-on can gate Sentry
   * and PostHog on it. Reads fail closed (return false) when the pref cannot be
   * read.
   */
  namespace Telemetry {
    /**
     * Returns the current value of the Thunderbird telemetry upload preference.
     * Resolves to false (opted out) if the preference cannot be read.
     */
    function getUploadEnabled(): Promise<boolean>;

    /** Fires when the telemetry upload preference changes, with the new value. */
    const onChanged: {
      addListener(
        callback: (uploadEnabled: boolean) => Promise<void> | void
      ): void;
      removeListener(
        callback: (uploadEnabled: boolean) => Promise<void> | void
      ): void;
    };
  }
}
