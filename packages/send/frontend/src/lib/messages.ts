/*
This file contains all the messages that are displayed to the user.
Every key is a getter that calls t() on every read, so it follows the
active locale (#1088) rather than the one active at import.
*/

import { t } from '@send-frontend/l10n';
import { MAX_FILE_SIZE_HUMAN_READABLE } from './const';

export const CLIENT_MESSAGES = {
  get SHOULD_LOG_IN() {
    return t('send-login-required');
  },
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
  // part the user can act on. The bodies name the "Retry" button
  // (send-boot-button-retry) that the login banner and the boot panel show.
  get COOKIES_BLOCKED_TITLE() {
    return t('send-boot-cookies-blocked-title');
  },
  get COOKIES_BLOCKED_BANNER_BODY() {
    return t('send-boot-cookies-blocked-body');
  },

  // Boot diagnostics (apps/send/BootDiagnostics.vue). With "block all
  // cookies" Firefox denies browser storage too, and the app bundle cannot
  // load at all, so this is shown by the pre-app bootstrap.
  get STORAGE_BLOCKED_TITLE() {
    return t('send-boot-storage-blocked-title');
  },
  get STORAGE_BLOCKED_BODY() {
    return t('send-boot-storage-blocked-body');
  },
  get APP_LOAD_FAILED_TITLE() {
    return t('send-boot-app-load-failed-title');
  },
  get APP_LOAD_FAILED_BODY() {
    return t('send-boot-app-load-failed-body');
  },
};
