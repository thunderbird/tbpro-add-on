// import { initSentry } from '@send-frontend/lib/sentry';
import { mountApp, setupApp } from 'send-frontend/src/apps/send/setup';
import { createApp } from 'vue';
import ManagementPage from './AddonManagementPage.vue';
import { initSentry } from './lib/sentry';

const app = createApp(ManagementPage);
initSentry(app);
setupApp(app);
mountApp(app, '#management-page');
