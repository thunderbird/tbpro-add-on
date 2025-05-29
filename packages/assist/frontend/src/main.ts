import './assets/main.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { initSentry } from '@/lib/sentry';

import App from './App.vue';
const app = createApp(App);

initSentry(app);

app.use(createPinia());

app.mount('#app');
