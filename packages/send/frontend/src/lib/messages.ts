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
  COOKIES_BLOCKED_BODY:
    `Send stores a cookie to keep you signed in, and Thunderbird is currently ` +
    `refusing it. Open Settings → Privacy & Security → Web Content and turn on ` +
    `"Accept cookies from sites". If that is already on, also set "Accept ` +
    `third-party cookies" to "From visited". Then choose "Check again".`,
  // Passive login-banner variant of COOKIES_BLOCKED_BODY: the banner offers a
  // "Retry" button instead of the popup's "Check again" wording.
  COOKIES_BLOCKED_BANNER_BODY:
    `Send stores a cookie to keep you signed in, and your browser is currently ` +
    `refusing it. Open Settings → Privacy & Security → Web Content and turn on ` +
    `"Accept cookies from sites". If that is already on, also set "Accept ` +
    `third-party cookies" to "From visited". Then choose "Retry".`,
  SETUP_CHECK_FAILED: `Send couldn't check whether your account is ready to upload. Check your internet connection, then choose "Check again".`,
  SETUP_DID_NOT_COMPLETE: `Setup didn't finish last time. Choose "Continue Setup" to try again.`,
  SIGNED_OUT_RETURN_TO_COMPOSE: `You're not signed in to Send. Go back to the compose window and sign in again to continue this upload.`,
};
