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
            try {
              // Find existing server (created via createAccount())
              const incomingServer = MailServices.accounts.findServer(
                accountConfig.incoming.username,
                accountConfig.incoming.hostname,
                accountConfig.incoming.type
              );

              const oauth2Module = new OAuth2Module();
              const initialized = oauth2Module.initFromMail(incomingServer);

              if (!initialized) {
                console.error("Failed to initialize OAuth2Module");
                return false;
              }

              await oauth2Module.setRefreshToken(refreshToken);
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
