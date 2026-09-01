import type { ApiCallFailure } from './api';

/**
 * Whether Send's session cookie is actually reaching the backend.
 *
 * The add-on's pages run from a `moz-extension://` document and authenticate to
 * the Send backend with an httpOnly, SameSite=None cookie. A moz-extension
 * document only gets first-party cookie treatment when the extension holds a
 * host permission for the target (Firefox bug 1629436), so when Thunderbird is
 * set to refuse third-party cookies that cookie can simply vanish from the
 * request -- and every requireJWT-gated route then answers as if nobody were
 * signed in. Bugzilla 2064458.
 *
 * `unknown` is the third state, and the reason this is not a boolean: "we could
 * not tell" must never be reported to the user as "your cookies are blocked",
 * or we send someone to change a Thunderbird setting that was never the
 * problem. A signed-out user, an offline user, a rate-limited user and a merely
 * expired session all land here.
 */
export type CookieAccess = 'ok' | 'blocked' | 'unknown';

/**
 * True only when we positively determined the cookie is not arriving -- never
 * on a guess. Anything that tells the user to change a cookie setting must go
 * through this rather than comparing the string inline.
 */
export const isCookieAccessBlocked = (state: CookieAccess) =>
  state === 'blocked';

/**
 * `requireJWT`'s code for "no cookie reached us", as opposed to the codes for a
 * cookie that arrived and was too old. The distinction is the whole basis of
 * this module and is easy to get wrong: `requireJWT` also answers 403 for an
 * expired refresh token and 401 for an expired access token, and *both* of
 * those prove the cookie arrived, because validateJWT only reaches them after
 * reading it. Keying on the status alone would report a routine hour-old
 * session as blocked cookies.
 *
 * Pinned on the backend side by send/backend/src/test/middleware.test.ts.
 */
const COOKIE_MISSING_ERROR = 'token_not_found';
/**
 * Fallback for a backend that predates the `error` code above. The add-on and
 * the backend deploy separately, so an add-on build can reach an older server;
 * without this the feature would silently do nothing there. Same test pins it.
 */
const COOKIE_MISSING_MESSAGE = 'Token not found';

type CookieAccessEvidence = {
  /** Did the cookie-gated call (`users/me`) come back with a body? */
  cookieRouteSucceeded: boolean;
  /** How the cookie-gated call failed, if it did. */
  cookieRouteFailure: ApiCallFailure | null;
  /** Did the Bearer-only call (`auth/oidc/me`) confirm a live session? */
  bearerSessionValid: boolean;
};

/** Did the backend say, specifically, that no cookie arrived? */
function saysCookieMissing(failure: ApiCallFailure | null): boolean {
  if (failure?.kind !== 'http' || failure.status !== 403 || !failure.body) {
    return false;
  }
  try {
    if (JSON.parse(failure.body)?.error === COOKIE_MISSING_ERROR) {
      return true;
    }
  } catch {
    // Not JSON -- fall through to the message check.
  }
  return failure.body.includes(COOKIE_MISSING_MESSAGE);
}

/**
 * Tells "the cookie is not reaching the backend" apart from "you are signed
 * out", using two calls the validator already makes -- no extra request.
 *
 * The discriminator is the disagreement between them: `auth/oidc/me` accepts
 * the OIDC Bearer token, while every requireJWT route reads the session
 * exclusively from the cookie. A live Bearer session alongside a cookie route
 * that reports no cookie at all means the session is fine and the cookie is
 * the thing going missing.
 *
 * That last sentence is load-bearing and will stop being true: issue #1191
 * proposes making those routes accept the Bearer token too, at which point the
 * cookie leg succeeds on the token and this silently always answers 'ok'. If
 * you are here doing that migration, this needs a Bearer-suppressed leg or
 * deleting outright -- see #1191 for both options.
 */
export function classifyCookieAccess({
  cookieRouteSucceeded,
  cookieRouteFailure,
  bearerSessionValid,
}: CookieAccessEvidence): CookieAccess {
  if (cookieRouteSucceeded) {
    return 'ok';
  }

  // Without a live Bearer session there is nothing to disagree with: a missing
  // cookie is equally well explained by the user having signed out.
  if (bearerSessionValid && saysCookieMissing(cookieRouteFailure)) {
    return 'blocked';
  }

  return 'unknown';
}
