import Extension from 'send-frontend/src/apps/send/ExtensionPage.vue';
import { createApp } from 'vue';
import { mountApp, setupApp } from 'send-frontend/src/apps/send/setup';
import { gateSentryOnTelemetry } from '../sentryGate';

const app = createApp(Extension);

// Sentry must be initialized (or not) before mount so it can hook the app.
await gateSentryOnTelemetry(app);
setupApp(app);
mountApp(app, '#extension-page');
