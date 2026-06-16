/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

/**
 * AccountHub Experiment API
 *
 * Listens for new incoming-server registrations from Thunderbird's Accounts Hub.
 * When a Thundermail account is added, retrieves its OIDC/OAuth2 refresh token
 * and fires the onAccountAdded event so the add-on can log the user in automatically.
 */

(function (exports) {
  var { MailServices } = ChromeUtils.importESModule(
    'resource:///modules/MailServices.sys.mjs'
  );
  var { OAuth2Module } = ChromeUtils.importESModule(
    'resource:///modules/OAuth2Module.sys.mjs'
  );

  /** Matches both production (mail.thundermail.com) and staging (mail.stage-thundermail.com) hosts. */
  const THUNDERMAIL_HOST_PATTERN = /thundermail\.com$/i;

  class AccountHub extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
      return {
        AccountHub: {
          onAccountAdded: new ExtensionCommon.EventManager({
            context,
            name: 'AccountHub.onAccountAdded',
            register(fire) {
              const serverListener = {
                QueryInterface: ChromeUtils.generateQI([
                  'nsIIncomingServerListener',
                ]),

                async onServerLoaded(server) {
                  try {
                    const hostname = server.hostname;
                    console.log(
                      `[AccountHub] onServerLoaded fired for host: ${hostname}`
                    );
                    if (!THUNDERMAIL_HOST_PATTERN.test(hostname)) {
                      console.log(
                        `[AccountHub] Host ${hostname} is not a Thundermail host — ignoring.`
                      );
                      return;
                    }

                    const email = server.username;
                    console.log(
                      `[AccountHub] Thundermail host matched. email=${email}`
                    );

                    const oauth2Module = new OAuth2Module();
                    if (!oauth2Module.initFromMail(server)) {
                      console.warn(
                        `[AccountHub] Failed to initialize OAuth2Module for ${hostname}`
                      );
                      return;
                    }
                    console.log('[AccountHub] OAuth2Module initialized.');

                    // getRefreshToken() asynchronously reads the stored token
                    // from the Thunderbird login manager (password manager).
                    // The token is guaranteed to be stored already because
                    // verifyConfig() (which runs OAuth2 auth) completes before
                    // createAccountInBackend() fires NotifyServerLoaded.
                    console.log('[AccountHub] Awaiting getRefreshToken()...');
                    const token = await oauth2Module.getRefreshToken();
                    console.log(
                      `[AccountHub] getRefreshToken() resolved. type=${typeof token}, hasToken=${!!token}, length=${
                        token ? token.length : 0
                      }`
                    );

                    if (!token) {
                      console.warn(
                        `[AccountHub] No OIDC token available for ${email} — skipping auto-login`
                      );
                      return;
                    }

                    // Retrieve the display name from the account's default identity.
                    const account =
                      MailServices.accounts.findAccountForServer(server);
                    const name = account?.defaultIdentity?.fullName ?? '';
                    console.log(
                      `[AccountHub] Resolved name="${name}". Firing onAccountAdded for ${email}.`
                    );

                    fire.async({ token, email, name });
                    console.log(
                      `[AccountHub] fire.async dispatched for ${email}.`
                    );
                  } catch (e) {
                    console.error(
                      '[AccountHub] Error in onServerLoaded handler:',
                      e
                    );
                  }
                },

                // Required by nsIMsgIncomingServerListener but not used here.
                onServerUnloaded(_server) { },
                onServerChanged(_server) { },
              };

              MailServices.accounts.addIncomingServerListener(serverListener);

              // Return cleanup function — called when the listener is removed.
              return () => {
                MailServices.accounts.removeIncomingServerListener(
                  serverListener
                );
              };
            },
          }).api(),
        },
      };
    }
  }

  exports.AccountHub = AccountHub;
})(this);
