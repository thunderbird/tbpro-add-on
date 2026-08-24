import '@send-frontend/lib/logger';
import i18n from '@send-frontend/composables/i18n';
import posthogPlugin, {
  setPosthogConsent,
} from '@send-frontend/plugins/posthog';
import { VueQueryPlugin } from '@tanstack/vue-query';
import '@thunderbirdops/services-ui/style.css';
import FloatingVue from 'floating-vue';
import 'floating-vue/dist/style.css';
import { getSharedPinia } from '@send-frontend/lib/shared-pinia';
import { createVfm } from 'vue-final-modal';
import 'vue-final-modal/style.css';
import './style.css';

export function setupApp(app, telemetryAllowed = false) {
  const pinia = getSharedPinia();
  app.use(VueQueryPlugin);
  app.use(pinia);
  app.use(FloatingVue);
  app.use(posthogPlugin);
  app.use(i18n);
  // Honor the Thunderbird telemetry opt-out: PostHog only initializes (and
  // sends anything) when telemetry is allowed. See issue #892.
  setPosthogConsent(telemetryAllowed);
}
export function mountApp(app, nodeName) {
  const vfm = createVfm();
  app.use(vfm).mount(nodeName);
}
