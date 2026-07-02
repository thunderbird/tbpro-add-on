/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

/**
 * Telemetry Experiment API
 *
 * Exposes Thunderbird's telemetry opt-out preference
 * (datareporting.healthreport.uploadEnabled) to the WebExtension so the add-on
 * can gate Sentry and PostHog on it. Reads fail closed: if the preference
 * cannot be read, telemetry is treated as disabled (opted out).
 */

(function (exports) {
  const TELEMETRY_PREF = 'datareporting.healthreport.uploadEnabled';

  /**
   * Reads the telemetry upload preference, defaulting to false (opted out) on
   * any error so we never send telemetry when the pref state is unknown.
   */
  function readUploadEnabled() {
    try {
      return Services.prefs.getBoolPref(TELEMETRY_PREF, false);
    } catch (e) {
      console.error('[Telemetry] Failed to read telemetry preference:', e);
      return false;
    }
  }

  class Telemetry extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
      return {
        Telemetry: {
          async getUploadEnabled() {
            return readUploadEnabled();
          },

          onChanged: new ExtensionCommon.EventManager({
            context,
            name: 'Telemetry.onChanged',
            register(fire) {
              const observer = {
                QueryInterface: ChromeUtils.generateQI(['nsIObserver']),
                observe(_subject, _topic, data) {
                  // When observing a single branch, `data` is the full name of
                  // the pref that changed.
                  if (data === TELEMETRY_PREF) {
                    fire.async(readUploadEnabled());
                  }
                },
              };

              Services.prefs.addObserver(TELEMETRY_PREF, observer);

              // Return cleanup function — called when the listener is removed.
              return () => {
                Services.prefs.removeObserver(TELEMETRY_PREF, observer);
              };
            },
          }).api(),
        },
      };
    }
  }

  exports.Telemetry = Telemetry;
})(this);
