/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

(function (exports) {
  var { cloudFileAccounts } = ChromeUtils.importESModule(
    "resource:///modules/cloudFileAccounts.sys.mjs"
  );

  var { setTimeout } = ChromeUtils.importESModule(
    "resource://gre/modules/Timer.sys.mjs"
  );

  exports.ProTweaks = class extends ExtensionCommon.ExtensionAPI {

    // Work around https://bugzilla.mozilla.org/show_bug.cgi?id=1999233
    async _initProviderIcon(retries=5) {
      let provider = cloudFileAccounts.getProviderForType("ext-" + this.extension.id);
      if (!provider) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return this._initProviderIcon(retries - 1);
      }
      Object.defineProperty(provider, "iconURL", {
        configurable: true,
        enumerable: true,
        get: () => {
          return this.extension.getURL("icons/send-glyph.svg");
        }
      });
    }

    onStartup() {
      this._initProviderIcon();
    }

    getAPI(_context) {
      return {
        ProTweaks: {}
      }
    }
  };
})(this);
