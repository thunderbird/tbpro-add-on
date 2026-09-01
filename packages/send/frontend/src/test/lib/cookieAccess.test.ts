import type { ApiCallFailure } from '@send-frontend/lib/api';
import {
  classifyCookieAccess,
  isCookieAccessBlocked,
} from '@send-frontend/lib/cookieAccess';
import { describe, expect, it } from 'vitest';

/**
 * Bugzilla 2064458 -- the Send add-on showed "Finish setting up Send" forever,
 * with no error, when Thunderbird blocked third-party cookies. Every
 * requireJWT-gated route reads the session only from the `authorization`
 * cookie, so a blocked cookie looks like a signed-out user unless something
 * compares it against the Bearer route that still works.
 *
 * The trap these tests exist to guard is that requireJWT's *status* is not
 * enough: it answers 403 for an expired refresh cookie and 401 for an expired
 * access cookie, and both of those prove the cookie arrived. Only the
 * `token_not_found` answer means no cookie reached the server.
 */

const httpFailure = (status: number, body?: string): ApiCallFailure => ({
  kind: 'http',
  status,
  statusText: 'Forbidden',
  body,
});

const noCookie = httpFailure(
  403,
  JSON.stringify({
    message: 'Not authorized: Token not found',
    error: 'token_not_found',
  })
);

describe('classifyCookieAccess — Bugzilla 2064458 (session cookie never reaches the backend)', () => {
  it('reports blocked when the Bearer session is live and the cookie route says no cookie arrived', () => {
    expect(
      classifyCookieAccess({
        cookieRouteSucceeded: false,
        cookieRouteFailure: noCookie,
        bearerSessionValid: true,
      })
    ).toBe('blocked');
  });

  it('reports blocked from the message alone, for a backend too old to send the error code', () => {
    expect(
      classifyCookieAccess({
        cookieRouteSucceeded: false,
        cookieRouteFailure: httpFailure(
          403,
          JSON.stringify({ message: 'Not authorized: Token not found' })
        ),
        bearerSessionValid: true,
      })
    ).toBe('blocked');
  });

  it('reports unknown for a 401, because requireJWT only answers 401 after verifying a refresh cookie that did arrive', () => {
    expect(
      classifyCookieAccess({
        cookieRouteSucceeded: false,
        cookieRouteFailure: httpFailure(
          401,
          JSON.stringify({
            message: 'Not authorized: Token expired',
            error: 'access_token_expired',
          })
        ),
        bearerSessionValid: true,
      })
    ).toBe('unknown');
  });

  it('reports unknown for a 401 even if its body mentions a missing token, because the message fallback is a substring match and only 403 can mean no cookie', () => {
    expect(
      classifyCookieAccess({
        cookieRouteSucceeded: false,
        cookieRouteFailure: httpFailure(401, 'Not authorized: Token not found'),
        bearerSessionValid: true,
      })
    ).toBe('unknown');
  });

  it('reports unknown when the refresh cookie merely expired, since that cookie plainly reached the server', () => {
    expect(
      classifyCookieAccess({
        cookieRouteSucceeded: false,
        cookieRouteFailure: httpFailure(
          403,
          JSON.stringify({
            message: 'Not authorized: Refresh token expired',
            error: 'refresh_token_expired',
          })
        ),
        bearerSessionValid: true,
      })
    ).toBe('unknown');
  });

  it('reports ok when the cookie-gated route returned a body', () => {
    expect(
      classifyCookieAccess({
        cookieRouteSucceeded: true,
        cookieRouteFailure: null,
        bearerSessionValid: true,
      })
    ).toBe('ok');
  });

  it('reports ok even when the Bearer session looks dead, because a cookie that worked is proof enough on its own', () => {
    expect(
      classifyCookieAccess({
        cookieRouteSucceeded: true,
        cookieRouteFailure: null,
        bearerSessionValid: false,
      })
    ).toBe('ok');
  });

  it('reports unknown when no cookie arrived but the Bearer session is not live either, so a signed-out user is never told to change a cookie setting', () => {
    expect(
      classifyCookieAccess({
        cookieRouteSucceeded: false,
        cookieRouteFailure: noCookie,
        bearerSessionValid: false,
      })
    ).toBe('unknown');
  });

  it('reports unknown when the cookie-gated route failed with a status that says nothing about the cookie', () => {
    for (const status of [404, 429, 500, 502]) {
      expect(
        classifyCookieAccess({
          cookieRouteSucceeded: false,
          cookieRouteFailure: httpFailure(status, 'Token not found'),
          bearerSessionValid: true,
        })
      ).toBe('unknown');
    }
  });

  it('reports unknown when the cookie-gated route failed with a network error rather than a response', () => {
    expect(
      classifyCookieAccess({
        cookieRouteSucceeded: false,
        cookieRouteFailure: {
          kind: 'network',
          status: null,
          error: new Error('offline'),
        },
        bearerSessionValid: true,
      })
    ).toBe('unknown');
  });

  it('reports unknown when the cookie-gated route was rate limited', () => {
    expect(
      classifyCookieAccess({
        cookieRouteSucceeded: false,
        cookieRouteFailure: {
          kind: 'rate_limited',
          status: 429,
          retryAfterMs: 1000,
        },
        bearerSessionValid: true,
      })
    ).toBe('unknown');
  });

  it('reports unknown when the cookie-gated route failed without recording why', () => {
    expect(
      classifyCookieAccess({
        cookieRouteSucceeded: false,
        cookieRouteFailure: null,
        bearerSessionValid: true,
      })
    ).toBe('unknown');
  });

  it('reports unknown when a 403 carried no body to identify it', () => {
    expect(
      classifyCookieAccess({
        cookieRouteSucceeded: false,
        cookieRouteFailure: httpFailure(403),
        bearerSessionValid: true,
      })
    ).toBe('unknown');
  });
});

describe('isCookieAccessBlocked — Bugzilla 2064458', () => {
  it('is true only for the blocked state, so an undetermined check never sends the user to change a setting', () => {
    expect(isCookieAccessBlocked('blocked')).toBe(true);
    expect(isCookieAccessBlocked('unknown')).toBe(false);
    expect(isCookieAccessBlocked('ok')).toBe(false);
  });
});
