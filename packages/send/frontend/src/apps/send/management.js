import { initSentry } from '@send-frontend/lib/sentry';
import { createApp } from 'vue';
import ManagementPage from './ManagementPage.vue';
import router from './router';
import { mountApp, setupApp } from './setup';

const app = createApp(ManagementPage);

initSentry(app);
app.use(router);
setupApp(app);
mountApp(app, '#management-page');
