import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { extractBearerToken, introspectToken } from './oidc';

/**
 * Service-to-service authentication for the Send backend's internal endpoints
 * (#1247).
 *
 * Internal endpoints are called by other Thunderbird services (today: Accounts
 * reading per-user Send storage usage), never by end users, so there is no
 * cookie or user session here — only a Bearer client-credentials token.
 *
 * The security model is a client allowlist, not an OAuth scope. Send and
 * Accounts run in different VPCs so there is no IP allowlist (#1216); instead,
 * a request is authorized only when Keycloak introspection reports the token
 * `active` AND the token's calling client (`client_id`, or `azp` as a
 * fallback) is present in the `INTERNAL_ALLOWED_CLIENT_IDS` allowlist.
 *
 * Fail closed everywhere it matters:
 *   - 401 when no Bearer token is present or the token is not active.
 *   - 403 when the token is active but its client is not on the allowlist.
 *     An empty or missing allowlist means *no* client is allowed, so every
 *     request is rejected 403 — the endpoint is never accidentally open.
 *   - 503 when introspection is unconfigured or the introspection call throws.
 *     Unlike user auth (which fails OPEN so a Keycloak blip cannot sign
 *     everyone out), an internal endpoint with no working security boundary
 *     must not answer at all.
 *
 * The middleware is scope-capable: pass `requiredScope` to additionally require
 * a space-delimited scope from the introspection response. Scope is unset by
 * default because #1216 chose a client allowlist over a custom scope; a scope
 * can be layered on later as configuration without a code change here.
 *
 * Auditing lives here rather than in the route handlers because the rejections
 * above never reach a route handler — a route-level audit would record only the
 * requests that passed, leaving probes with bad or absent tokens untraced. One
 * structured line is emitted per request from the response's `finish` event, so
 * it reports the real final status for every outcome, authorized or not.
 */

/**
 * Parse the comma-separated `INTERNAL_ALLOWED_CLIENT_IDS` allowlist. An empty
 * or missing value yields an empty set, which rejects every caller (403).
 */
function getAllowedClientIds(): Set<string> {
  return new Set(
    (process.env.INTERNAL_ALLOWED_CLIENT_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

/** Whether introspection is configured; if not, we cannot fail-closed safely. */
function isIntrospectionConfigured(): boolean {
  return Boolean(
    process.env.OIDC_TOKEN_INTROSPECTION_URL &&
    process.env.OIDC_CLIENT_ID &&
    process.env.OIDC_CLIENT_SECRET
  );
}

/**
 * One structured audit line per internal request: who called, whose record they
 * asked for, the outcome, and how long it took. Deliberately excludes the
 * token and any storage value — the middleware never sees the response body,
 * so usage numbers cannot leak into logs from here.
 *
 * Denials decided by this middleware are emitted at warn level so a rejected
 * caller stays visible to alerting. Every other outcome is info — including the
 * routine 404 for a subject Send has never seen, which is an expected answer to
 * a legitimate caller and must not look like an incident. A 500 is info here
 * too; the global error handler already logs it at error level.
 *
 * Uses `console` directly rather than `utils/logger` on purpose: `logger.info`
 * is suppressed when NODE_ENV=production, which would erase this audit trail in
 * exactly the environment that needs it.
 */
function auditInternalRequest(fields: {
  route: string;
  clientId?: string;
  sub?: string;
  status: number;
  latencyMs: number;
  /**
   * Response `error` code when this middleware rejected the request. Absent
   * when the route handler decided the status instead (200/404/500).
   */
  reason?: string;
}): void {
  const line = JSON.stringify({ msg: 'internal_request', ...fields });
  if (fields.reason) {
    console.warn(line);
  } else {
    console.info(line);
  }
}

/**
 * Express middleware factory guarding an internal service-to-service route.
 *
 * @param requiredScope Optional scope that must also be present in the token's
 *   space-delimited `scope`. Omit to authorize purely by the client allowlist.
 */
export function requireServiceAuth(requiredScope?: string): RequestHandler {
  return async function requireServiceAuthHandler(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const startedAt = Date.now();

    // Captured now, not inside the `finish` callback: Express restores
    // `req.params` and `req.baseUrl` to the enclosing layer's values as the
    // router unwinds, so on the error path both are already undefined by the
    // time `finish` fires.
    const route = `${req.method} ${req.baseUrl}${req.route?.path ?? ''}`;
    const sub = req.params.sub;

    // Filled in as we learn them, then read once the response is on the wire.
    const audit: { clientId?: string; reason?: string } = {};

    res.on('finish', () => {
      auditInternalRequest({
        route,
        clientId: audit.clientId,
        sub,
        // The response's own status, so a 500 from the global error handler is
        // audited as accurately as a rejection decided here.
        status: res.statusCode,
        latencyMs: Date.now() - startedAt,
        reason: audit.reason,
      });
    });

    /** Reject the request and record why, for the audit line. */
    const deny = (status: number, message: string, error: string): void => {
      audit.reason = error;
      res.status(status).json({ message, error });
    };

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      deny(401, 'Authorization token required', 'missing_token');
      return;
    }

    // No working introspection means no security boundary — fail closed (503)
    // rather than guessing. Checked before the call so a misconfigured
    // deployment answers 503, never 401/403 from a thrown config error.
    if (!isIntrospectionConfigured()) {
      // Logged separately from the audit line: this is a deployment fault that
      // ops needs to see, not a fact about the caller.
      console.error(
        'Service auth: token introspection is not configured; failing closed'
      );
      deny(
        503,
        'Authentication service unavailable',
        'auth_service_unavailable'
      );
      return;
    }

    let introspection;
    try {
      introspection = await introspectToken(token);
    } catch (error) {
      // As above: the underlying error is what makes an outage diagnosable, and
      // it has no place in the structured per-request line.
      console.error('Service auth: token introspection unavailable:', error);
      deny(
        503,
        'Authentication service unavailable',
        'auth_service_unavailable'
      );
      return;
    }

    if (introspection.active !== true) {
      deny(401, 'Invalid or expired token', 'invalid_token');
      return;
    }

    // The calling client is whatever Keycloak asserts in the introspection
    // response — never anything the caller can set on the request. Prefer
    // `client_id`; fall back to `azp` (authorized party). Recorded before the
    // allowlist check so a denied caller is still named in the audit line.
    const clientId = introspection.client_id ?? introspection.azp;
    audit.clientId = clientId;

    const allowlist = getAllowedClientIds();
    if (!clientId || !allowlist.has(clientId)) {
      deny(403, 'Client not allowed', 'client_not_allowed');
      return;
    }

    // Optional scope check: only enforced when a required scope is configured.
    if (requiredScope) {
      const scopes = (introspection.scope ?? '').split(' ').filter(Boolean);
      if (!scopes.includes(requiredScope)) {
        deny(403, 'Insufficient scope', 'insufficient_scope');
        return;
      }
    }

    next();
  };
}
