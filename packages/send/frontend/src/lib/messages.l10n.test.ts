// The migrated CLIENT_MESSAGES are getters, so each read follows the active
// locale instead of freezing the one active at import time (#1088).
import { resetL10n, setLocale } from '@send-frontend/l10n';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_FILE_SIZE_HUMAN_READABLE } from './const';
import { CLIENT_MESSAGES } from './messages';

describe('CLIENT_MESSAGES upload keys', () => {
  beforeEach(() => resetL10n());

  it('keep the English text and follow the locale on every read', async () => {
    expect(CLIENT_MESSAGES.FILE_TOO_BIG).toBe(
      `Your file size is not supported, please try with files smaller than ${MAX_FILE_SIZE_HUMAN_READABLE}`
    );
    expect(CLIENT_MESSAGES.UPLOAD_FAILED).toBe(
      'Upload failed. Please try again.'
    );
    expect(CLIENT_MESSAGES.STORAGE_LIMIT_EXCEEDED).toBe(
      'Uploading this file would exceed your storage limit. Please delete some files and try again.'
    );
    await setLocale(['de']);
    expect(CLIENT_MESSAGES.FILE_TOO_BIG).toContain(
      `kleiner als ${MAX_FILE_SIZE_HUMAN_READABLE} sind`
    );
    expect(CLIENT_MESSAGES.UPLOAD_FAILED).toBe(
      'Hochladen fehlgeschlagen. Bitte versuchen Sie es erneut.'
    );
    expect(CLIENT_MESSAGES.STORAGE_LIMIT_EXCEEDED).toMatch(/^Mit dieser Datei/);
  });
});

describe('CLIENT_MESSAGES sign-in and startup keys', () => {
  beforeEach(() => resetL10n());

  it('keep the English titles and follow the locale on every read', async () => {
    expect(CLIENT_MESSAGES.COOKIES_BLOCKED_TITLE).toBe(
      'Thunderbird is blocking cookies for Send'
    );
    expect(CLIENT_MESSAGES.STORAGE_BLOCKED_TITLE).toBe(
      'Thunderbird is blocking storage for Send'
    );
    expect(CLIENT_MESSAGES.APP_LOAD_FAILED_TITLE).toBe('Send could not start');
    expect(CLIENT_MESSAGES.APP_LOAD_FAILED_BODY).toContain('Choose “Retry”');
    await setLocale(['de']);
    expect(CLIENT_MESSAGES.COOKIES_BLOCKED_TITLE).toBe(
      'Thunderbird blockiert Cookies für Send'
    );
    expect(CLIENT_MESSAGES.SHOULD_LOG_IN).toMatch(/^Sie müssen sich/);
    expect(CLIENT_MESSAGES.APP_LOAD_FAILED_BODY).toContain(
      'Wählen Sie „Erneut versuchen“'
    );
  });
});
