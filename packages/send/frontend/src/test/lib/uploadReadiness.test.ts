import { findUploadBlocker } from '@send-frontend/lib/uploadReadiness';
import { describe, expect, it } from 'vitest';

/**
 * Bugzilla 2064458. The order these are read in is the fix: when the session
 * cookie is not reaching the backend, every cookie-authenticated answer the
 * validator produces is false -- including `hasBackedUpKeys` -- so reading them
 * in the wrong order reports a fabricated missing passphrase and opens a setup
 * window that cannot help.
 */

const healthy = {
  hasBackedUpKeys: true,
  isTokenValid: true,
  hasForcedLogin: false,
  cookieAccess: 'ok' as const,
};

describe('findUploadBlocker — Bugzilla 2064458', () => {
  it('lets a healthy account through with nothing blocking it', () => {
    expect(findUploadBlocker(healthy)).toBeNull();
  });

  it('reports blocked cookies ahead of the missing key backup, which cannot be trusted while the cookie is missing', () => {
    expect(
      findUploadBlocker({
        ...healthy,
        cookieAccess: 'blocked',
        hasBackedUpKeys: false,
        isTokenValid: false,
      })
    ).toEqual({ status: 'cookies-blocked' });
  });

  it('reports signed out when the cookie route answered fine but the token check did not', () => {
    expect(findUploadBlocker({ ...healthy, isTokenValid: false })).toEqual({
      status: 'signed-out',
    });
  });

  it('reports signed out when the validator forced a logout', () => {
    expect(findUploadBlocker({ ...healthy, hasForcedLogin: true })).toEqual({
      status: 'signed-out',
    });
  });

  it('reports an undetermined check, not a signed-out session, when the checks themselves could not answer', () => {
    // An offline user: nothing answered, so `isTokenValid` is false too.
    // Telling them to sign in again sends them somewhere that cannot work.
    expect(
      findUploadBlocker({
        ...healthy,
        cookieAccess: 'unknown',
        isTokenValid: false,
        hasBackedUpKeys: false,
      })
    ).toEqual({ status: 'unknown' });
  });

  it('reports an undetermined check ahead of the missing key backup', () => {
    expect(
      findUploadBlocker({
        ...healthy,
        cookieAccess: 'unknown',
        hasBackedUpKeys: false,
      })
    ).toEqual({ status: 'unknown' });
  });

  it('reports needs-setup only once the cookie is fine, the session is live and the key backup is genuinely missing', () => {
    expect(findUploadBlocker({ ...healthy, hasBackedUpKeys: false })).toEqual({
      status: 'needs-setup',
    });
  });
});
