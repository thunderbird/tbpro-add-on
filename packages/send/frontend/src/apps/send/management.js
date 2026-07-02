import { closeSentry, initSentry } from '@send-frontend/lib/sentry';
import {
  isTelemetryAllowed,
  onTelemetryChanged,
} from '@send-frontend/lib/telemetryConsent';
import { setPosthogConsent } from '@send-frontend/plugins/posthog';
import { createApp } from 'vue';
import ManagementPage from './ManagementPage.vue';
import router from './router';
import { mountApp, setupApp } from './setup';

const app = createApp(ManagementPage);

// Resolve the Thunderbird telemetry opt-out before initializing any telemetry,
// so nothing is sent when the user has opted out. See issue #892.
(async () => {
  const telemetryAllowed = await isTelemetryAllowed();
  if (telemetryAllowed) {
    initSentry(app);
  }
  app.use(router);
  setupApp(app, telemetryAllowed);
  mountApp(app, '#management-page');

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
