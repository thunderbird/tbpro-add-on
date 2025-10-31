/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
/* globals ExtensionCommon, Services */

'use strict';

/**
 * TBPRO Menu
 *
 * This api provides a set of methods for creating and managing an item in the app
 * menu for TB Pro. This includes submenus and an event to react to clicks on
 * items. All create elements are tracked and removed automaticlly if the addon
 * is removed, reset or shutdown.
 *
 * Provided Methods (specifics of each method in jsdoc below):
 *
 * init - Creates the app menu entry initially with text prompting to sign in.
 * updateMenuItem - Update the button in the app menu.
 * addSubMenu - Add a submenu.
 * addSubMenuItem - Add an item to a given submenu.
 * removeMenuItem - Remove the main menu item.
 * removeSubMenuItem - Remove given item from a submenu.
 * removeSubMenu - Remove given submenu item.
 * reset - Reset the header button to the initial state.
 */

// Using a closure to not leak anything but the API to the outside world.
(function (exports) {
  const emitter = new ExtensionCommon.EventEmitter();

  const styleSheetContent = `
    .tbpro-header-button {
      position: relative;
      padding-bottom: 8px;
      margin-bottom: 8px;
      justify-content: flex-start;

      & .tbpro-header-content {
        font-size: 13px;
        flex: 1;
      }

      & .tbpro-menu-item-bold-text {
        font-weight: bold;
      }

      & image {
        margin-left: 4rem;
      }
    }

    .tbpro-panel-header {
      position: relative;
      border-bottom: 0;
      margin-bottom: 8px;

      & h1 {
        text-align: left;
        font-size: 13px;
      }
    }

    .tbpro-divider {
      left: 8px;
      bottom: 0;
      position: absolute;
      width: calc(100% - 16px);
      height: 2px;
      align-self: stretch;
      background-image: linear-gradient(to right, var(--color-accent-blue) 31%, var(--color-accent-purple));

      &.tbpro-submenu-divider {
        width: calc(100% - 32px);
        left: 16px;
      }
    }
  `;

  var TBProMenu = class extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
      return {
        TBProMenu: {
          /**
           * Initialize the TBProMenu.
           *
           * This adds the header button to the app menu initially in a non logged in state.
           *
           * @param {number} windowId - Id of the window the extension is installed in.
           */
          init(windowId) {
            // Get the native window belonging to the specified windowId.
            let { window } = context.extension.windowManager.get(windowId);

            // Store the window for easy reuse when calling other methods
            this.window = window;

            // Inject the stylesheet
            const stylesheet = this._createElement({
              type: 'style',
              text: styleSheetContent,
            });

            const menuItem = this._generateHeaderButton();
            const banner = window.document.getElementById(
              'appMenu-addon-banners'
            );

            this.menuItem = menuItem;
            this.reset();

            banner.parentNode.insertBefore(menuItem, banner.nextSibling);

            window.document.querySelector('body').appendChild(stylesheet);

            // Listen for click events on the header and emit the
            // menu-item-clicked event with the header-click action.
            menuItem.addEventListener('click', (e) => {
              emitter.emit(
                'menu-item-clicked',
                e.target.ownerGlobal,
                'header-click'
              );
            });
          },

          /**
           * Update the header button in the main app menu.
           *
           * Note: The text/i18TextId and boldText/i18nBoldTextId options are
           * mutually exclusive and the i18n id's will always take precedent if
           * both are provided.
           *
           * @param {object} options - Options for updating the menu item.
           * @param {string} options.boldText - The text that should be bold in the menuItem.
           * @param {string} options.command - What should be populated in the oncommand attribute.
           * @param {string} options.nav - The id of a submenu which should be
           *  navigated to when the item is clicked. This option will override the command option.
           * @param {string} options.i18nBoldTextId - The id of the i18n message to use for bold text.
           * @param {string} options.i18nTextId - The id of the i18n message to use for the plain text.
           * @param {string} options.text - The text that should be plain text in the menuItem.
           *
           * @returns {HTMLElement} - The submenu which was created.
           */
          updateMenuItem({
            boldText,
            command,
            i18nBoldTextId,
            i18nTextId,
            nav,
            text,
          }) {
            this.window.menuItem = this.menuItem;
            this.menuItem.querySelector('.tbpro-menu-item-text').textContent =
              i18nTextId ? this._localize(i18nTextId) : text;
            this.menuItem.querySelector(
              '.tbpro-menu-item-bold-text'
            ).textContent = i18nBoldTextId
              ? this._localize(i18nBoldTextId)
              : boldText;
            this.menuItem.classList.toggle('subviewbutton-nav', nav);
            this.menuItem.setAttribute(
              'oncommand',
              nav ? `PanelUI.showSubView('${nav}', this);` : command
            );
          },

          /**
           * Add a submenu to the app menu which the header button will navigate to.
           *
           * Note this will override any set command on the header button with
           * the command to open the submenu. It will however still emit the
           * normal header-click action event.
           *
           * @param {string} text - The username of the current user to
           *  display in the menu header
           * @param {string} id - Id to use for the submenu.
           */
          addSubMenu(text, id) {
            const { document } = this.window;

            const panel = this._createElement({
              type: 'panelview',
              id,
              classes: ['PanelUI-subView'],
              xul: true,
            });

            const box = this._createElement({
              type: 'box',
              xul: true,
              classes: ['panel-header', 'tbpro-panel-header'],
            });

            const backButton = this._createElement({
              type: 'toolbarbutton',
              classes: [
                'subviewbutton',
                'subviewbutton-iconic',
                'subviewbutton-back',
              ],
              xul: true,
              attributes: {
                closemenu: 'none',
                tabindex: '0',
                'aria-label': this._localize('back'),
              },
            });

            const icon = this._createElement({
              type: 'image',
              xul: true,
              classes: ['toolbarbutton-icon'],
            });

            const label = this._createElement({
              type: 'label',
              xul: true,
              classes: ['toolbarbutton-text'],
              attributes: {
                crop: 'end',
                flex: '1',
              },
            });

            backButton.appendChild(icon);
            backButton.appendChild(label);
            backButton.addEventListener('click', () => {
              document.querySelector('#appMenu-multiView').goBack();
            });

            const heading = this._createElement({ type: 'h1' });
            heading.textContent = text;

            const divider = this._createElement({
              type: 'div',
              classes: ['tbpro-divider', 'tbpro-submenu-divider'],
            });

            box.appendChild(backButton);
            box.appendChild(heading);
            box.appendChild(divider);

            const vbox = this._createElement({
              type: 'vbox',
              xul: true,
              classes: ['panel-subview-body'],
            });

            vbox.appendChild(box);
            panel.appendChild(vbox);

            document.getElementById('appMenu-multiView').appendChild(panel);

            return panel;
          },

          /**
           * Append a submenu item to the submenu.
           *
           * Note: The text/i18TextId options are mutually exclusive and the
           * i18n id will always take precedent if both are provided.
           *
           * @param {object} options - The options for the submenu item to be added.
           * @param {string} options.text - Text to be used for the submenu item.
           * @param {string} options.close - Id of menu item to close when the
           *  item is clicked. set to an empty string to close everything,
           *  use "none" or omit completely to not close anything.
           * @param {string} options.action - The action name to use when for the
           *  onCommnd event emitted when the item is clicked.
           * @param {string} options.i18nId - The id of the i18n message to use for the button text.
           * @param {string} options.id - The id of the submenu item. Used to generate the html ID
           *  and for being able to remove the item later.
           * @param {string} options.nav - The string of a submenu which should
           *  be navigated to when the item is clicked
           *
           * @returns {HTMLElement} - The submenu item which was created.
           */
          addSubMenuItem({
            text,
            close = 'none',
            action,
            i18nId,
            id,
            nav,
            menuId,
          }) {
            const classes = ['subviewbutton', 'subviewbutton-iconic'];
            const attributes = {
              tabindex: '0',
              closemenu: close,
            };

            if (nav) {
              classes.push('subviewbutton-nav');
              attributes.oncommand = `PanelUI.showSubView('${nav}', this);`;
            }

            const button = this._createElement({
              type: 'toolbarbutton',
              classes,
              attributes,
              xul: true,
              id,
              text,
              i18nId,
            });

            if (action) {
              button.addEventListener('click', (e) => {
                emitter.emit('menu-item-clicked', e.target.ownerGlobal, action);
              });
            }

            this.window.document
              .querySelector(`#${menuId} vbox`)
              .appendChild(button);
          },

          /**
           * Remove an item from the submenu.
           *
           * @param {HTMLElement} item
           */
          removeSubMenuItem(id) {
            this.window.document.querySelector(`#${id}`)?.remove();
          },

          /**
           * Remove the submenu.
           *
           * @param {HTMLElement} item
           */
          removeSubMenu(id) {
            this.window.document.querySelector(`#${id}`)?.remove();
          },

          /**
           * Remove the main menu item.
           */
          removeMenuItem() {
            this.menuItem.remove();
          },

          /**
           * Reset the state of the header button to a non logged in state.
           */
          reset() {
            this.updateMenuItem({
              text: this._localize('signin'),
              boldText: this._localize('title'),
              nav: false,
            });

            this.menuItem.removeAttribute('oncommand');

            // The goBack method may not exist yet on startup if the app menu
            // has not yet been clicked.
            this.window.document.querySelector('#appMenu-multiView').goBack?.();
          },

          /**
           * Create an element based on the provided options and return it.
           * This method tags all created elements with an extension id so when
           * the extension is removed all of the elements will automaticlly
           * be removed as well.
           *
           * Note: The text/i18TextId options are mutually exclusive and the
           * i18n id will always take precedent if both are provided.
           *
           * @param {object} options - The options to use for createing the element.
           * @param {object} options.attributes - Key value pairs of attributes to be set on the element.
           * @param {string[]} options.classes - An array of classes to be added to the element.
           * @param {string} options.i18nId - The id of an i18n message to use for the elements textContent.
           * @param {string} options.id - The id of the element to to be set.
           * @param {string} options.text - The text to use for the textContent of the element.
           * @param {string} options.type - The type of element to be created.
           * @param {boolean} options.xul - If the element is a xul element and should be created with createXULElement rather than createElement.
           * @returns {HTMLElement}
           */
          _createElement({ attributes, classes, i18nId, id, text, type, xul }) {
            const element =
              this.window.document[xul ? 'createXULElement' : 'createElement'](
                type
              );

            // We set the extension id on all elements so they can easily be
            // cleaned up later.
            element.setAttribute(
              'data-extension-injected',
              context.extension.id
            );

            if (classes) {
              element.classList.add(...classes);
            }
            if (attributes) {
              Object.keys(attributes).forEach((key) =>
                element.setAttribute(key, attributes[key])
              );
            }

            if (id) {
              element.id = id;
            }

            if (i18nId) {
              element.textContent = this._localize(i18nId);
            } else if (text) {
              element.textContent = text;
            }

            return element;
          },

          /**
           * Generate the app menu header button for TBPro. This will generate
           * the button with no text.
           *
           * @returns {HTMLElement}
           */
          _generateHeaderButton() {
            const toolbarButton = this._createElement({
              type: 'toolbarbutton',
              classes: [
                'subviewbutton',
                'subviewbutton-iconic',
                'tbpro-header-button',
              ],
              attributes: { closemenu: 'none' },
              xul: true,
            });

            const divider = this._createElement({
              type: 'div',
              classes: ['tbpro-divider'],
            });

            const text = this._createElement({
              type: 'span',
              classes: ['tbpro-menu-item-text'],
            });
            const wrapper = this._createElement({
              type: 'span',
              classes: ['tbpro-header-content'],
            });
            const boldText = this._createElement({
              type: 'span',
              classes: ['tbpro-menu-item-bold-text'],
            });

            wrapper.appendChild(text);
            wrapper.appendChild(boldText);

            toolbarButton.appendChild(wrapper);
            toolbarButton.appendChild(divider);

            return toolbarButton;
          },

          /**
           * Get the translated string if available of the i18n message specified.
           * @param {string} string - The message id to get translation for.
           * @returns {string} The translated message.
           */
          _localize(string) {
            return context.extension.localeData.localizeMessage(string);
          },

          // An event to inform the WebExtension the menu entry has been clicked.
          onCommand: new ExtensionCommon.EventManager({
            context,
            name: 'TBProMenu.onCommand',
            register(fire) {
              function callback(event, window, action) {
                // Let the event return the windowId of the window where the menu
                // item was clicked along with the action name for context.
                return fire.async(
                  context.extension.windowManager.getWrapper(window).id,
                  action
                );
              }

              emitter.on('menu-item-clicked', callback);

              return function () {
                emitter.off('menu-item-clicked', callback);
              };
            },
          }).api(),
        },
      };
    }

    onShutdown(isAppShutdown) {
      // This function is called if the extension is disabled or removed, or
      // Thunderbird closes. We usually do not have to do any cleanup, if
      // Thunderbird is shutting down entirely.
      if (isAppShutdown) {
        return;
      }

      // Remove the menu from all open normal windows.
      const { extension } = this;
      for (const window of Services.wm.getEnumerator('mail:3pane')) {
        if (window) {
          let elements = Array.from(
            window.document.querySelectorAll(
              '[data-extension-injected="' + extension.id + '"]'
            )
          );
          for (let element of elements) {
            element.remove();
          }
        }
      }

      // Flush all caches.
      Services.obs.notifyObservers(null, 'startupcache-invalidate');
    }
  };

  // Export the API by assigning it to the exports parameter of the anonymous
  // closure function, which is the global this.
  exports.TBProMenu = TBProMenu;
})(this);
