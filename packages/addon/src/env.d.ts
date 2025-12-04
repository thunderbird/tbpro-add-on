/// <reference types="vite/client" />

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
}
