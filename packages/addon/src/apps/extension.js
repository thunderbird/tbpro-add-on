import Extension from 'send-frontend/src/apps/send/ExtensionPage.vue';
import { createApp } from 'vue';

import { mountApp, setupApp } from 'send-frontend/src/apps/send/setup';
import { initSentry } from './lib/sentry';

const app = createApp(Extension);

initSentry(app);

setupApp(app);
mountApp(app, '#extension-page');
