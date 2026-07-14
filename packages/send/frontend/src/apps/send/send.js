import { closeSentry, initSentry } from '@send-frontend/lib/sentry';
import {
  isTelemetryAllowed,
  onTelemetryChanged,
} from '@send-frontend/lib/telemetryConsent';
import { setPosthogConsent } from '@send-frontend/plugins/posthog';
import { createApp } from 'vue';
import Send from './SendPage.vue';
import router from './router';
import { mountApp, setupApp } from './setup';

const app = createApp(Send);

// Resolve the Thunderbird telemetry opt-out before initializing any telemetry,
// so nothing is sent when the user has opted out. Outside Thunderbird this
// resolves to allowed, preserving existing website behavior. See issue #892.
(async () => {
  const telemetryAllowed = await isTelemetryAllowed();
  if (telemetryAllowed) {
    initSentry(app);
  }
  app.use(router);
  setupApp(app, telemetryAllowed);
  mountApp(app, '#app');

  // React to runtime pref changes without requiring a reinstall/reload.
  onTelemetryChanged((enabled) => {
    setPosthogConsent(enabled);
    if (enabled) {
      initSentry(app);
    } else {
      closeSentry();
    }
  });
})();
