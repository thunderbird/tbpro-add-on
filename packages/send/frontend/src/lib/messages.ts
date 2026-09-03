/* 
This file contains all the messages that are displayed to the user. 
Whenever we switch to something like i18n, this file will be the one to change.
*/

import { MAX_FILE_SIZE_HUMAN_READABLE } from './const';

export const CLIENT_MESSAGES = {
  SHOULD_LOG_IN: `You need to log into your mozilla account. Make sure you're in the allow list for alpha access.`,
  FILE_TOO_BIG: `Your file size is not supported, please try with files smaller than ${MAX_FILE_SIZE_HUMAN_READABLE}`,
  UPLOAD_FAILED: `Upload failed. Please try again.`,
  STORAGE_LIMIT_EXCEEDED: `Uploading this file would exceed your storage limit. Please delete some files and try again.`,

  // Bugzilla 2064458. The backend host is deliberately not named: it changes
  // between production, staging and local builds, and the setting path is the
  // part the user can act on.
  COOKIES_BLOCKED_TITLE: `Thunderbird is blocking cookies for Send`,
  // Login-banner copy: the banner offers a "Retry" button.
  COOKIES_BLOCKED_BANNER_BODY:
    `Send stores a cookie to keep you signed in, and your browser is currently ` +
    `refusing it. Open Settings → Privacy & Security → Web Content and turn on ` +
    `"Accept cookies from sites". If that is already on, also set "Accept ` +
    `third-party cookies" to "From visited". Then choose "Retry".`,
};
