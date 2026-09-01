import { CookieAccess, isCookieAccessBlocked } from './cookieAccess';

/**
 * Why the upload popup cannot start an upload yet.
 *
 * This used to be a boolean, which could only say "not ready" -- so every
 * cause was funnelled into the passphrase setup flow, including the users
 * whose problem that flow cannot fix. Bugzilla 2064458.
 */
export type UploadReadiness =
  | { status: 'ready' }
  // A live session, but the session cookie never reaches the backend.
  | { status: 'cookies-blocked' }
  | { status: 'signed-out' }
  // Positively no key backup: the one state the setup window can fix.
  | { status: 'needs-setup' }
  // Could not determine: offline, a server error, or rate-limited.
  | { status: 'unknown' };

export type UploadBlocker = Exclude<UploadReadiness, { status: 'ready' }>;

type ValidatorAnswer = {
  hasBackedUpKeys: boolean;
  isTokenValid: boolean;
  hasForcedLogin: boolean;
  cookieAccess: CookieAccess;
};

/**
 * Picks which blocker to report from a `validator()` answer, or null when
 * nothing is blocking the upload.
 *
 * The rule holding this together: no cookie-authenticated answer may be
 * believed until we know the cookie is getting through, because when it is not,
 * all of them are false -- `hasBackedUpKeys` included. Reading those first is
 * what turned a cookie problem into a fabricated missing passphrase.
 */
export function findUploadBlocker({
  hasBackedUpKeys,
  isTokenValid,
  hasForcedLogin,
  cookieAccess,
}: ValidatorAnswer): UploadBlocker | null {
  if (isCookieAccessBlocked(cookieAccess)) {
    return { status: 'cookies-blocked' };
  }

  // Only claim "signed out" on positive evidence: the validator forced a
  // logout, or the cookie route answered fine while the token check did not.
  // Otherwise it is the check itself that failed, and telling an offline user
  // to sign in again sends them somewhere that cannot work.
  if (hasForcedLogin || (cookieAccess === 'ok' && !isTokenValid)) {
    return { status: 'signed-out' };
  }

  if (cookieAccess === 'unknown') {
    return { status: 'unknown' };
  }

  if (!hasBackedUpKeys) {
    return { status: 'needs-setup' };
  }

  return null;
}
