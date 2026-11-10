/*
This file contains all the messages that are displayed to the user.
Migrated keys are getters that call t() on every read, so they follow the
active locale (#1088); the rest are still English constants.
*/

import { t } from '@send-frontend/l10n';
import { MAX_FILE_SIZE_HUMAN_READABLE } from './const';

export const CLIENT_MESSAGES = {
  SHOULD_LOG_IN: `You need to log into your mozilla account. Make sure you're in the allow list for alpha access.`,
  get FILE_TOO_BIG() {
    return t('send-upload-error-file-too-big', {
      max: MAX_FILE_SIZE_HUMAN_READABLE,
    });
  },
  get UPLOAD_FAILED() {
    return t('send-upload-error-retry');
  },
  get STORAGE_LIMIT_EXCEEDED() {
    return t('send-upload-error-storage-limit');
  },

  // Bugzilla 2064458. The backend host is deliberately not named: it changes
  // between production, staging and local builds, and the setting path is the
  // part the user can act on.
  COOKIES_BLOCKED_TITLE: `Thunderbird is blocking cookies for Send`,
  // Shown by the login banner and the boot panel; both offer a "Retry" button.
  COOKIES_BLOCKED_BANNER_BODY:
    `Send stores a cookie to keep you signed in, and your browser is currently ` +
    `refusing it. Open Settings → Privacy & Security → Web Content and turn on ` +
    `"Accept cookies from sites". If that is already on, also set "Accept ` +
    `third-party cookies" to "From visited". Then choose "Retry".`,

  // Boot diagnostics (apps/send/BootDiagnostics.vue). With "block all
  // cookies" Firefox denies browser storage too, and the app bundle cannot
  // load at all, so this is shown by the pre-app bootstrap.
  STORAGE_BLOCKED_TITLE: `Thunderbird is blocking storage for Send`,
  STORAGE_BLOCKED_BODY:
    `Send keeps your sign-in state and encryption keys in browser storage, ` +
    `and your browser is refusing access to it. This happens when all cookies ` +
    `are blocked. Open Settings → Privacy & Security → Web Content and turn on ` +
    `"Accept cookies from sites", then choose "Retry".`,
  APP_LOAD_FAILED_TITLE: `Send could not start`,
  APP_LOAD_FAILED_BODY:
    `The application failed to load. Choose "Retry" to reload the page. ` +
    `If this keeps happening, please let us know.`,
};
