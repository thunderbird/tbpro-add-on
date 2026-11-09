// import { initSentry } from '@send-frontend/lib/sentry';
import { mountApp, setupApp } from 'send-frontend/src/apps/send/setup';
import { requestedLocales, setLocale } from 'send-frontend/src/l10n';
import { createApp } from 'vue';
import ManagementPage from './AddonManagementPage.vue';

(async () => {
  const app = createApp(ManagementPage);
  // The management page follows Thunderbird's UI language.
  await setLocale(requestedLocales('thunderbird'));
  setupApp(app);
  mountApp(app, '#management-page');
})();
