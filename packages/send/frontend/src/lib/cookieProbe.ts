import type { ApiConnection } from './api';

/**
 * Result of the pre-login cookie round-trip probe.
 *
 * Bugzilla 2064458: the Send backend keeps the session in an httpOnly,
 * SameSite=None cookie. When Thunderbird (or a browser) is set to refuse
 * third-party cookies, that cookie never reaches the backend and the entire
 * app is non-functional — not just uploads. After login, `cookieAccess.ts`
 * can infer a block from the disagreement between the cookie-gated route and
 * the Bearer route; before login there is no session to infer from, so this
 * module performs a *positive* round trip instead: ask the backend to set a
 * throwaway probe cookie with the same SameSite=None; Secure attributes
 * (`GET /api/cookie-check/set`), then ask whether it came back
 * (`GET /api/cookie-check/verify`).
 *
 * `unknown` exists for the same reason it does in `cookieAccess.ts`: "we could
 * not tell" must never be surfaced to the user as "your cookies are blocked",
 * or we send someone off to change a Thunderbird setting that was never the
 * problem. An offline user, a rate-limited user and a backend too old to have
 * the probe endpoints all land on 'unknown', and callers must hide the
 * blocked-cookies warning for it.
 */
export type CookieProbeResult = 'enabled' | 'blocked' | 'unknown';

/**
 * Positively determine whether cookies for the Send backend round-trip.
 *
 * Answers 'blocked' only when both probe calls succeeded and the backend
 * affirmatively reported the probe cookie missing — never on a failed or
 * inconclusive call. See {@link CookieProbeResult} for why.
 */
export async function probeCookiesEnabled(
  api: ApiConnection
): Promise<CookieProbeResult> {
  try {
    const setResponse = await api.call<{ ok: boolean }>('cookie-check/set');
    if (!setResponse?.ok) {
      // The set call failed or answered unexpectedly (e.g. an older backend
      // without the endpoint): the probe is inconclusive, not a block.
      return 'unknown';
    }

    const verifyResponse = await api.call<{ cookiesEnabled: boolean }>(
      'cookie-check/verify'
    );
    if (verifyResponse === null || verifyResponse === undefined) {
      return 'unknown';
    }

    return verifyResponse.cookiesEnabled ? 'enabled' : 'blocked';
  } catch {
    // Network failures and thrown errors are inconclusive by definition.
    return 'unknown';
  }
}
