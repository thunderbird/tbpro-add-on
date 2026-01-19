import '@send-frontend/lib/logger';
import posthogPlugin from '@send-frontend/plugins/posthog';
import { VueQueryPlugin } from '@tanstack/vue-query';
import '@thunderbirdops/services-ui/style.css';
import FloatingVue from 'floating-vue';
import 'floating-vue/dist/style.css';
import { getSharedPinia } from '@send-frontend/lib/shared-pinia';
import { createVfm } from 'vue-final-modal';
import 'vue-final-modal/style.css';
import './style.css';

export function setupApp(app) {
  const pinia = getSharedPinia();
  app.use(VueQueryPlugin);
  app.use(pinia);
  app.use(FloatingVue);
  app.use(posthogPlugin);
}
export function mountApp(app, nodeName) {
  const vfm = createVfm();
  app.use(vfm).mount(nodeName);
}
