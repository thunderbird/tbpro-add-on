import Extension from 'send-frontend/src/apps/send/ExtensionPage.vue';
import { createApp } from 'vue';
import { mountApp, setupApp } from 'send-frontend/src/apps/send/setup';
import { requestedLocales, setLocale } from 'send-frontend/src/l10n';
import { gateSentryOnTelemetry } from '../sentryGate';

const app = createApp(Extension);

// Not awaited: a slow or hung telemetry read must never block the UI (#1278).
// Sentry attaches to the app once the gate resolves; the few ms before that
// are uncaptured, which is acceptable.
void gateSentryOnTelemetry(app);
// The popup follows Thunderbird's UI language.
await setLocale(requestedLocales('thunderbird'));
setupApp(app);
mountApp(app, '#extension-page');
