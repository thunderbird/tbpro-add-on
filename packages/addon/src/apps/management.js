// import { initSentry } from '@send-frontend/lib/sentry';
import { mountApp, setupApp } from 'send-frontend/src/apps/send/setup';
import { requestedLocales, setLocale, t } from 'send-frontend/src/l10n';
import { createApp } from 'vue';
import ManagementPage from './AddonManagementPage.vue';

const app = createApp(ManagementPage);
// The management page follows Thunderbird's UI language.
await setLocale(requestedLocales('thunderbird'));
// index.management.html's <title> stays as the pre-boot en-US fallback.
document.title = t('addon-management-title');
setupApp(app);
mountApp(app, '#management-page');
