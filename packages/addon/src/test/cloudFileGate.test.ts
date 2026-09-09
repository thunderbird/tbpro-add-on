import { describe, expect, it } from 'vitest';

import { cloudFileStartupAction } from '../cloudFileGate';

/**
 * Regression guard for Bug 2036665: a fresh, never-signed-in profile must not
 * create a Send cloudfile account at startup. The built-in system add-on runs on
 * every fresh Thunderbird profile (including under automation), so eagerly
 * creating an account there pollutes the default profile and breaks
 * Thunderbird's own cloudfile tests (browser_ext_cloudFile.js,
 * browser_repeat_upload.js, addRemoveAccounts), which assert a clean baseline.
 *
 * And regression guard for Bug 2064203 comment 4 / Bug 2067502: when the login
 * probe could not read storage, startup must change nothing. Treating that as
 * "signed out" unregistered the Send provider for signed-in users and took
 * sending away from them for the rest of the session.
 */
describe('cloudFileStartupAction', () => {
  it('unregisters the provider when the user is signed out', () => {
    expect(cloudFileStartupAction({ isLoggedIn: false, username: null })).toBe(
      'unregister'
    );
  });

  it('registers the cloudfile account when already signed in', () => {
    expect(
      cloudFileStartupAction({ isLoggedIn: true, username: 'user@example.com' })
    ).toBe('register');
  });

  it('changes nothing when storage could not be read', () => {
    expect(
      cloudFileStartupAction({
        isLoggedIn: false,
        username: null,
        storageUnavailable: true,
      })
    ).toBe('leave-as-is');
  });
});
