// import { initSentry } from '@send-frontend/lib/sentry';
import { mountApp, setupApp } from 'send-frontend/src/apps/send/setup';
import { createApp } from 'vue';
import ManagementPage from './AddonManagementPage.vue';
import './style.css';

const app = createApp(ManagementPage);
setupApp(app);
mountApp(app, '#management-page');
