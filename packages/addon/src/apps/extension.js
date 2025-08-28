import Extension from 'send-frontend/src/apps/send/ExtensionPage.vue';
import { mountApp, setupApp } from 'send-frontend/src/apps/send/setup';
import { initSentry } from 'send-frontend/src/lib/sentry';
import { createApp } from 'vue';

const app = createApp(Extension);

initSentry(app);

setupApp(app);
mountApp(app, '#extension-page');
