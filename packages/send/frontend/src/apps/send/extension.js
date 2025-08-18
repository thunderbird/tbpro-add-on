import { initSentry } from '@send-frontend/lib/sentry';
import { createApp } from 'vue';
import Extension from './ExtensionPage.vue';
import router from './router';
import { mountApp, setupApp } from './setup';

const app = createApp(Extension);

initSentry(app);
app.use(router);
setupApp(app);
mountApp(app, '#extension-page');
