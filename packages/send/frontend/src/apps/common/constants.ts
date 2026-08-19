import config from '@send-frontend/config';

export const PHRASE_SIZE = 6;

// The Send web app's own origin, from /config.js (container) or a baked VITE_*
// (dev, the S3 build, the add-on XPI).
//
// Deliberately NOT defaulted to '': callers do `url.startsWith(BASE_URL)` --
// including an origin check on incoming extension messages -- and an empty
// prefix matches EVERY url, which turns those guards into no-ops. Leaving it
// undefined keeps the previous behaviour, where such a comparison matches
// nothing.
export const BASE_URL = config.sendClientUrl;

// Sibling Thunderbird Pro services. These were previously either hard-coded to
// PRODUCTION (dashboard, contact form) or toggled by
// `BASE_URL.includes('send.tb.pro')` -- a two-valued switch derived from a URL
// substring, so it could not express a third environment and sent tb-dev users
// to the legacy staging stack. They are now plain config values: set them per
// environment via APP_* (runtime, EKS) or VITE_* (build time). See
// platform-infrastructure#712 / #886.
export const DASHBOARD_URL = config.dashboardUrl;
export const THUNDERMAIL_URL = config.thundermailUrl;
export const APPOINTMENT_URL = config.appointmentUrl;
export const ACCOUNTS_URL = config.accountsUrl;
export const CONTACT_FORM_URL = config.contactFormUrl;

// Not environment-dependent: one public site, no per-environment variant.
export const SUPPORT_URL = 'https://support.tb.pro';
export const PRIVACY_POLICY_URL = 'https://tb.pro/privacy';
export const TERMS_OF_SERVICE_URL = 'https://tb.pro/terms';
