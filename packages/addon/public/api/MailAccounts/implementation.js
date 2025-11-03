"use strict";

// Using a closure to not leak anything but the API to the outside world.
(function (exports) {
    var { CreateInBackend } = ChromeUtils.importESModule(
        "resource:///modules/accountcreation/CreateInBackend.sys.mjs"
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
                  async setToken(authToken, emailAddress) {
                    try {
                      console.log(`About to set token for account`);
                      const loginOrigin = "oauth://auth.tb.pro";
                      const scope = "openid email offline_access profile";

                      console.log(`ok. switched the args. hopefully this is the right one?!!!`);
                      console.log(`




`);
                      // Check if login already exists
                      const existingLogins = Services.logins.findLogins(loginOrigin, null, scope);
                      const existingLogin = existingLogins.find(login => login.username === emailAddress);
                      console.log(`Here are existing logins for origin and scope`);
                      console.log(existingLogins);
                      console.log(`And here is a specific one that matches`);
                      console.log(existingLogin);
                      if (existingLogin) {
                        console.log(`Login already exists, updating token...`);
                        // Create a modified copy with the new token
                        const updatedLogin = existingLogin.clone();
                        updatedLogin.password = authToken;
                        Services.logins.modifyLogin(existingLogin, updatedLogin);
                      } else {
                        console.log(`Creating new login entry...`);
                        const login = Components.classes["@mozilla.org/login-manager/loginInfo;1"].createInstance(
                          Components.interfaces.nsILoginInfo
                        );
                        console.log(`...was able to instantiate`);
                        login.init(loginOrigin, null, scope, emailAddress, authToken, "", "");
                        console.log(`...was able to init`);
                        await Services.logins.addLoginAsync(login);
                        console.log(`...probably won't see this, but this prints after calling addLoginAsync`);
                      }

                      console.log(`Token set successfully`);
                      return true;
                    } catch (e) {
                      console.error("Error in setToken Experiment API:", e);
                      return false;
                    }
                  }
                  // async setToken(authToken, emailAddress) {
                  //   try {
                  //     console.log(`About to set token for account`);
                  //     const loginOrigin = "oauth://auth.tb.pro";
                  //     const scope = "openid email offline_access profile";
                  //     // const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
                  //     //   Ci.nsILoginInfo
                  //     // );

                  //     const login = Components.classes["@mozilla.org/login-manager/loginInfo;1"].createInstance(
                  //       Components.interfaces.nsILoginInfo
                  //     );

                  //     // init(aHost, aHttpRealm, aFormSubmitURL, aUsername, aPassword, aUserField, aPassField)
                  //     // We are using aHost (loginOrigin), aFormSubmitURL (scope), aUsername (email), and aPassword (token).
                  //     login.init(loginOrigin, null, scope, emailAddress, authToken, "", "");

                  //     // Asynchronously add the login to the password manager
                  //     const didItWork = await Services.logins.addLoginAsync(login);
                  //     console.log(didItWork);

                  //     console.log(`omg did it work?`);
                  //     return true;
                  //   } catch (e) {
                  //     console.error("Error in setToken Experiment API:", e);

                  //     return false;
                  //   }
                  // }
                },
            };
        }
    };

    // Export the API by assigning it to the exports parameter of the anonymous
    // closure function, which is the global `this`.
    exports.MailAccounts = MailAccounts;
})(this)
