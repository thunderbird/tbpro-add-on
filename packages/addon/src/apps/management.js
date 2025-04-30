// import { initSentry } from '@/lib/sentry';
import { createApp } from 'vue';
import ManagementPage from './ManagementPage.vue';

const app = createApp(ManagementPage);
app.mount('#management-page');
