import Extension from 'send-frontend/src/apps/send/ExtensionPage.vue';
import { createApp } from 'vue';
import { initSentry } from 'send-frontend/src/lib/sentry';
import { mountApp, setupApp } from 'send-frontend/src/apps/send/setup';

const app = createApp(Extension);

initSentry(app);

setupApp(app);
mountApp(app, '#extension-page');
