/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

(function (exports) {
  var { cloudFileAccounts } = ChromeUtils.importESModule(
    'resource:///modules/cloudFileAccounts.sys.mjs'
  );

  exports.CloudFileAccounts = class extends ExtensionCommon.ExtensionAPI {
    onStartup() {
      this._providerType = 'ext-' + this.extension.id;

      // The "Thunderbird Send" cloud file provider is declared via the manifest
      // `cloud_file` key, so Thunderbird registers it automatically on every
      // startup — including on fresh, never-signed-in profiles where the
      // built-in system add-on runs under automation. We keep a reference to the
      // provider object so it can be re-registered on sign-in (via
      // registerProvider()), which keeps the browser.cloudFile.onFileUpload
      // binding intact. See Bug 2036665.
      this._capturedProvider =
        cloudFileAccounts.getProviderForType(this._providerType) || null;

      // Hide the provider by default and only reveal it on explicit sign-in
      // (registerProvider() clears this flag). The manifest registration and the
      // background script's async startup race at startup; on slow debug builds
      // the manifest can register Send before the background script reads the
      // login state and asks us to hide it, briefly exposing Send and breaking
      // Thunderbird's cloudfile tests which assert a clean provider baseline
      // ("Got 2, expected 1"). Defaulting to keepUnregistered removes that race:
      // the provider is hidden synchronously the moment it is registered,
      // independent of the background script. See Bug 2048823.
      this._keepUnregistered = true;

      this._onProviderRegistered = this._onProviderRegistered.bind(this);
      cloudFileAccounts.on('providerRegistered', this._onProviderRegistered);

      // If the manifest already registered the provider before this ran, the
      // providerRegistered listener won't fire for it, so unregister it now.
      // (When the manifest registers later, the listener handles it inline,
      // since cloudFileAccounts.emit() invokes listeners synchronously.)
      if (cloudFileAccounts.getProviderForType(this._providerType)) {
        cloudFileAccounts.unregisterProvider(this._providerType);
      }
    }

    onShutdown(isAppShutdown) {
      if (isAppShutdown) {
        return;
      }

      cloudFileAccounts.off('providerRegistered', this._onProviderRegistered);
    }

    // EventEmitter invokes listeners as (eventName, ...args), so rather than
    // depend on the emitted argument we re-check the registry by our type.
    _onProviderRegistered() {
      const provider = cloudFileAccounts.getProviderForType(this._providerType);
      if (!provider) {
        return;
      }

      // Remember the provider instance so it can be re-registered on sign-in.
      this._capturedProvider = provider;

      // If we are meant to stay signed out, immediately undo the registration.
      if (this._keepUnregistered) {
        cloudFileAccounts.unregisterProvider(this._providerType);
      }
    }

    getAPI(_context) {
      const providerType = 'ext-' + this.extension.id;

      // Arrow functions keep `this` bound to the ExtensionAPI instance so the
      // register/unregister handlers can read and update the captured provider
      // and the _keepUnregistered flag set up in onStartup().
      return {
        CloudFileAccounts: {
          createAccount: async (type, configured) => {
            try {
              // Check if the provider is registered
              const provider = cloudFileAccounts.getProviderForType(type);
              if (!provider) {
                return {
                  success: false,
                  error: `Cloud file provider '${type}' is not registered. The extension may not be fully loaded yet.`,
                };
              }

              // Check if an account with this type already exists
              const existingAccount = cloudFileAccounts.accounts.find(
                (account) => account.type === type
              );

              if (existingAccount) {
                return {
                  success: true,
                  alreadyExists: true,
                  accountId: existingAccount.accountKey,
                  message: `Cloud file account of type '${type}' already exists.`,
                };
              }

              // Create the account
              const account = cloudFileAccounts.createAccount(type);

              if (!account) {
                return {
                  success: false,
                  error: `Failed to create cloud file account of type '${type}'.`,
                };
              }

              // Set the configured status
              account.configured = configured;

              return {
                success: true,
                accountId: account.accountKey,
                message: `Cloud file account created successfully with type '${type}'.`,
              };
            } catch (error) {
              return {
                success: false,
                error: `Error creating cloud file account: ${error.message}`,
              };
            }
          },

          // Re-register the Send provider (e.g. on sign-in). Idempotent: a
          // no-op if the provider is already in the registry.
          registerProvider: async () => {
            this._keepUnregistered = false;

            if (cloudFileAccounts.getProviderForType(providerType)) {
              return { success: true, alreadyRegistered: true };
            }

            if (!this._capturedProvider) {
              return {
                success: false,
                error: `No cloud file provider '${providerType}' available to register.`,
              };
            }

            try {
              cloudFileAccounts.registerProvider(
                providerType,
                this._capturedProvider
              );
              return { success: true };
            } catch (error) {
              return {
                success: false,
                error: `Error registering cloud file provider: ${error.message}`,
              };
            }
          },

          // Hide the Send provider while signed out. Idempotent: a no-op if the
          // provider is not currently registered.
          unregisterProvider: async () => {
            // Stay hidden even if Thunderbird registers the provider after this
            // call (manifest registration vs. background script startup race).
            this._keepUnregistered = true;

            const provider = cloudFileAccounts.getProviderForType(providerType);
            if (!provider) {
              return { success: true, alreadyUnregistered: true };
            }

            // Keep the instance so we can re-register it on sign-in.
            this._capturedProvider = provider;

            try {
              cloudFileAccounts.unregisterProvider(providerType);
              return { success: true };
            } catch (error) {
              return {
                success: false,
                error: `Error unregistering cloud file provider: ${error.message}`,
              };
            }
          },
        },
      };
    }
  };
})(this);
