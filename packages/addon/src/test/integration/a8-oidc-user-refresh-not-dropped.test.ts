/**
 * A8 — a genuine later token refresh / re-auth for the SAME account is no
 * longer silently dropped by the OIDC_USER mutual-exclusion guard.
 *
 * The #1025 fix (see a7-accounthub-login-races-web-login.test.ts) made the
 * OIDC_USER handler drop any incoming write when STORAGE_KEY_AUTH already
 * held a session. That unconditional drop also discarded a genuine later
 * token refresh for the same account arriving without a preceding SIGN_OUT,
 * leaving the add-on holding a stale/expired token while the UI still looked
 * authenticated. See https://github.com/thunderbird/tbpro-add-on/issues/1053.
 *
 * Fix under test: the handler now records { subject, writtenAt } under
 * STORAGE_KEY_AUTH_META on every accepted write and, when a session already
 * exists:
 *   - different subject            → drop (protects an in-flight login, #1025)
 *   - same subject, within the     → drop (concurrent duplicate race, a7)
 *     OIDC_USER_RACE_WINDOW_MS
 *   - same subject, older than the → accept (genuine refresh, #1053)
 *     race window
 */
import { OIDC_USER } from '@send-frontend/lib/const';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

const OIDC_USER_RACE_WINDOW_MS = 10_000; // mirrors background.ts

function makeUser(username: string, refreshToken: string) {
  return {
    profile: { preferred_username: username },
    refresh_token: refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
}

describe('A8: OIDC_USER same-subject refresh outside the race window is accepted', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    teardownHost();
  });

  it('FIXED (#1053): a same-account OIDC_USER arriving after the race window overwrites the stale session', async () => {
    const bg = stubContext(host);
    await import('../../background');

    await bg.deliverMessage({
      type: OIDC_USER,
      user: makeUser('user@example.com', 'token-1'),
    });

    const afterFirst = await bg.browser.storage.local.get('STORAGE_KEY_AUTH');
    expect(afterFirst['STORAGE_KEY_AUTH'].refresh_token).toBe('token-1');

    // Simulate time passing beyond the race window: age the stored meta
    // timestamp instead of mocking Date.now(), so the handler's own clock
    // reads stay real.
    await bg.browser.storage.local.set({
      STORAGE_KEY_AUTH_META: {
        subject: 'user@example.com',
        writtenAt: Date.now() - (OIDC_USER_RACE_WINDOW_MS + 60_000),
      },
    });

    // A genuine token refresh for the SAME account arrives later.
    await bg.deliverMessage({
      type: OIDC_USER,
      user: makeUser('user@example.com', 'token-2'),
    });

    const afterRefresh = await bg.browser.storage.local.get(
      'STORAGE_KEY_AUTH'
    );
    expect(afterRefresh['STORAGE_KEY_AUTH'].refresh_token).toBe('token-2');
  });

  it('still drops an OIDC_USER for a DIFFERENT subject while a session exists (#1025 intent preserved)', async () => {
    const bg = stubContext(host);
    await import('../../background');

    await bg.deliverMessage({
      type: OIDC_USER,
      user: makeUser('user-x@example.com', 'token-x'),
    });

    // Even well outside the race window, a different account must not
    // clobber the in-flight session.
    await bg.browser.storage.local.set({
      STORAGE_KEY_AUTH_META: {
        subject: 'user-x@example.com',
        writtenAt: Date.now() - (OIDC_USER_RACE_WINDOW_MS + 60_000),
      },
    });

    await bg.deliverMessage({
      type: OIDC_USER,
      user: makeUser('user-y@example.com', 'token-y'),
    });

    const after = await bg.browser.storage.local.get('STORAGE_KEY_AUTH');
    expect(after['STORAGE_KEY_AUTH'].refresh_token).toBe('token-x');
    expect(after['STORAGE_KEY_AUTH'].profile.preferred_username).toBe(
      'user-x@example.com'
    );
  });

  it('still drops a same-subject OIDC_USER arriving within the race window (a7 boundary)', async () => {
    const bg = stubContext(host);
    await import('../../background');

    // Back-to-back same-account writes, no time passing between them:
    // exactly the concurrent duplicate-login race from a7/#1025.
    await bg.deliverMessage({
      type: OIDC_USER,
      user: makeUser('user@example.com', 'token-1'),
    });
    await bg.deliverMessage({
      type: OIDC_USER,
      user: makeUser('user@example.com', 'token-2'),
    });

    const after = await bg.browser.storage.local.get('STORAGE_KEY_AUTH');
    expect(after['STORAGE_KEY_AUTH'].refresh_token).toBe('token-1');
  });
});
