import { describe, expect, it } from 'vitest';

import { shouldInitCloudFileOnStartup } from '../cloudFileGate';

/**
 * Regression guard for Bug 2036665: a fresh, never-signed-in profile must not
 * create a Send cloudfile account at startup. The built-in system add-on runs on
 * every fresh Thunderbird profile (including under automation), so eagerly
 * creating an account there pollutes the default profile and breaks
 * Thunderbird's own cloudfile tests (browser_ext_cloudFile.js,
 * browser_repeat_upload.js, addRemoveAccounts), which assert a clean baseline.
 */
describe('shouldInitCloudFileOnStartup', () => {
  it('does NOT init the cloudfile account when signed out', () => {
    expect(shouldInitCloudFileOnStartup(false)).toBe(false);
  });

  it('inits the cloudfile account when already signed in', () => {
    expect(shouldInitCloudFileOnStartup(true)).toBe(true);
  });
});
