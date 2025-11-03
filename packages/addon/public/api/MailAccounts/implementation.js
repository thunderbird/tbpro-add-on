"use strict";

// Using a closure to not leak anything but the API to the outside world.
(function (exports) {
    var { CreateInBackend } = ChromeUtils.importESModule(
        "resource:///modules/accountcreation/CreateInBackend.sys.mjs"
    );
    var { OAuth2Module } = ChromeUtils.importESModule(
        "resource:///modules/OAuth2Module.sys.mjs"
    );

  var { MailServices } = ChromeUtils.importESModule(
    "resource:///modules/MailServices.sys.mjs"
  );


    /**
     * Finds a mail account by iterating through all known accounts and their
     * identities, looking for a matching email address.
     * @param {string} emailAddress - The email address to search for.
     * @returns {nsIMsgAccount|null} - The found account, or null.
     */
    function getAccountByEmail(emailAddress) {
        const lowerEmail = emailAddress.toLowerCase();

        // Services.accounts.accounts holds all configured mail accounts
        for (const account of Services.accounts.accounts) {
            // Check all identities associated with this account
            for (const identity of account.identities) {
                if (identity.email.toLowerCase() === lowerEmail) {
                    return account;
                }
            }
            // As a fallback, check the default identity as well,
            // though it's typically in the .identities list.
            if (account.defaultIdentity && account.defaultIdentity.email.toLowerCase() === lowerEmail) {
                return account;
            }
        }
        return null; // No account found
    }

    /**
     * Finds an SMTP server by its key.
     * @param {string} serverKey - The key to search for.
     * @returns {nsISmtpServer|null} - The found server, or null.
     */
    function getSmtpServerByKey(serverKey) {
        if (!serverKey) {
            return null;
        }
        // Services.accounts.allSmtpServers holds all configured SMTP servers
        for (const server of Services.accounts.allSmtpServers) {
            if (server.key === serverKey) {
                return server;
            }
        }
        return null; // No server found
    }


    class MailAccounts extends ExtensionCommon.ExtensionAPI {
        getAPI(context) {
            return {
                // This key must match the class name.
                MailAccounts: {
                    async createAccount(accountConfig) {
                        try {
                            await CreateInBackend.createAccountInBackend(accountConfig);
                            return true;
                        } catch (e) {
                            console.log(e);
                            return false;
                        }

                    },
                  async setToken(refreshToken, accountConfig) {
                    console.log(`[setToken] here is the refreshToken`);
                    console.log(refreshToken);
                    try {
                      console.log(`[setToken] about to find server`);

                      const incomingServer = MailServices.accounts.findServer(
                        accountConfig.incoming.username,
                        accountConfig.incoming.hostname,
                        accountConfig.incoming.type
                      );
                      console.log(`[setToken] did we find one?`);
                      console.log(incomingServer);


                      // 3. Create and initialize an OAuth2Module instance
                      const oauth2Module = new OAuth2Module();
                      console.log(`[setToken] instantiated OAuth2Module`);

                      // Initialize it with the server details
                      const initialized = oauth2Module.initFromMail(incomingServer);
                      console.log(`[setToken] initialized OAuth2Module`);

                      if (!initialized) {
                        console.error("Failed to initialize OAuth2Module");
                        return false;
                      }
                      console.log(`[setToken] about to set refresh token`);

                      const result = await oauth2Module.setRefreshToken(refreshToken);
                      console.log(`does this return anything?`);
                      console.log(result);
                      console.log(`wait... did it work?`);
                      return true;
                    } catch (e) {
                      console.error("Error in setToken Experiment API (OAuth2Module):", e);
                      return false;
                    }
                  }
                },
            };
        }
    };

    // Export the API by assigning it to the exports parameter of the anonymous
    // closure function, which is the global `this`.
    exports.MailAccounts = MailAccounts;
})(this)
