// import { initSentry } from '@/lib/sentry';
import { mountApp, setupApp } from 'send-frontend/src/apps/send/setup';
import { createApp } from 'vue';
import ManagementPage from './ManagementPage.vue';

const app = createApp(ManagementPage);
setupApp(app);
mountApp(app, '#management-page');

