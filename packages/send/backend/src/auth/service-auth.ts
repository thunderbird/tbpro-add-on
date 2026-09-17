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
 */

/** Identifies the authenticated calling service; attached to the request. */
export interface ServiceCaller {
  /** Keycloak client id of the calling service, for audit logging and keying. */
  clientId: string;
}

export interface RequestWithServiceCaller extends Request {
  serviceCaller?: ServiceCaller;
}

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
 * Express middleware factory guarding an internal service-to-service route.
 *
 * @param requiredScope Optional scope that must also be present in the token's
 *   space-delimited `scope`. Omit to authorize purely by the client allowlist.
 */
export function requireServiceAuth(requiredScope?: string): RequestHandler {
  return async function requireServiceAuthHandler(
    req: RequestWithServiceCaller,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({
        message: 'Authorization token required',
        error: 'missing_token',
      });
      return;
    }

    // No working introspection means no security boundary — fail closed (503)
    // rather than guessing. Checked before the call so a misconfigured
    // deployment answers 503, never 401/403 from a thrown config error.
    if (!isIntrospectionConfigured()) {
      console.error(
        'Service auth: token introspection is not configured; failing closed'
      );
      res.status(503).json({
        message: 'Authentication service unavailable',
        error: 'auth_service_unavailable',
      });
      return;
    }

    let introspection;
    try {
      introspection = await introspectToken(token);
    } catch (error) {
      console.error('Service auth: token introspection unavailable:', error);
      res.status(503).json({
        message: 'Authentication service unavailable',
        error: 'auth_service_unavailable',
      });
      return;
    }

    if (introspection.active !== true) {
      res.status(401).json({
        message: 'Invalid or expired token',
        error: 'invalid_token',
      });
      return;
    }

    // The calling client is whatever Keycloak asserts in the introspection
    // response — never anything the caller can set on the request. Prefer
    // `client_id`; fall back to `azp` (authorized party).
    const clientId = introspection.client_id ?? introspection.azp;

    const allowlist = getAllowedClientIds();
    if (!clientId || !allowlist.has(clientId)) {
      // Audit trail for rejected callers: which client presented a live token
      // that is not allowlisted. The token itself is never logged.
      console.warn(
        `Service auth: client "${clientId ?? 'unknown'}" denied for ` +
          `${req.method} ${req.originalUrl}: not in INTERNAL_ALLOWED_CLIENT_IDS`
      );
      res.status(403).json({
        message: 'Client not allowed',
        error: 'client_not_allowed',
      });
      return;
    }

    // Optional scope check: only enforced when a required scope is configured.
    if (requiredScope) {
      const scopes = (introspection.scope ?? '').split(' ').filter(Boolean);
      if (!scopes.includes(requiredScope)) {
        console.warn(
          `Service auth: client "${clientId}" denied for ` +
            `${req.method} ${req.originalUrl}: missing scope "${requiredScope}"`
        );
        res.status(403).json({
          message: 'Insufficient scope',
          error: 'insufficient_scope',
        });
        return;
      }
    }

    req.serviceCaller = { clientId };
    next();
  };
}
