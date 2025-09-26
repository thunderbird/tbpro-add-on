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

                    }
                },
            };
        }
    };

    // Export the API by assigning it to the exports parameter of the anonymous
    // closure function, which is the global `this`.
    exports.MailAccounts = MailAccounts;
})(this)
