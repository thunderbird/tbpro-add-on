import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { extractBearerToken } from './oidc';

/**
 * Service-to-service authentication for the Send backend's internal endpoints
 * (#1247).
 *
 * Internal endpoints are called by other Thunderbird services (today: Accounts
 * reading per-user Send storage usage), never by end users, so there is no
 * cookie or user session here — only a static high-entropy integration key
 * presented as a Bearer token.
 *
 * The security model (#1216) is a static integration key issued by Send to the
 * caller, not an OAuth token: there is no token expiry and no central
 * revocation, so a leaked key stays valid until rotated on both sides. The
 * accepted mitigations are per-environment keys, secret-store-only delivery,
 * dual-key zero-downtime rotation, and audit logging. Send and Accounts run in
 * different VPCs, so there is no IP allowlist.
 *
 * Keys are configured via `INTERNAL_API_KEYS` as a comma-separated list of
 * `label:key` pairs, e.g. `accounts:<key1>,accounts-prev:<key2>`. Multiple
 * labeled keys enable zero-downtime rotation: add the new key under a new
 * label, roll callers over, then drop the old one. The label of the matched
 * key identifies the caller and is attached as `req.serviceCaller.label`.
 *
 * Fail closed everywhere it matters:
 *   - 503 when no key is configured. An internal endpoint with no security
 *     boundary must not answer at all — unlike user auth, which fails open so a
 *     transient outage cannot sign everyone out.
 *   - 401 when the Bearer token is missing or does not match any configured key.
 *
 * The presented token is compared against every configured key in constant time
 * (sha256 of both sides, then `crypto.timingSafeEqual`) so a mismatch reveals
 * nothing through timing. Key material is never logged.
 */

/** Identifies the authenticated calling service; attached to the request. */
export interface ServiceCaller {
  /** Label of the matched integration key, for audit logging. */
  label: string;
}

export interface RequestWithServiceCaller extends Request {
  serviceCaller?: ServiceCaller;
}

/** A configured integration key: its rotation label and secret material. */
interface ConfiguredKey {
  label: string;
  key: string;
}

/**
 * Parse `INTERNAL_API_KEYS` into labeled keys. The format is a comma-separated
 * list of `label:key` pairs; only the first colon splits (keys may themselves
 * contain colons). Entries missing a label or key are skipped. An empty or
 * missing value yields no keys, which fails every request closed (503).
 */
function getConfiguredKeys(): ConfiguredKey[] {
  return (process.env.INTERNAL_API_KEYS ?? '')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf(':');
      if (separator === -1) {
        return null;
      }
      const label = pair.slice(0, separator).trim();
      const key = pair.slice(separator + 1).trim();
      if (!label || !key) {
        return null;
      }
      return { label, key };
    })
    .filter((entry): entry is ConfiguredKey => entry !== null);
}

/**
 * Constant-time equality of two secrets. Both are hashed to a fixed-length
 * sha256 digest first so `timingSafeEqual` always compares equal-length buffers
 * (it throws on length mismatch, which would itself leak length) and the raw
 * key length is never revealed through timing.
 */
function keysMatch(presented: string, configured: string): boolean {
  const presentedHash = createHash('sha256').update(presented).digest();
  const configuredHash = createHash('sha256').update(configured).digest();
  return timingSafeEqual(presentedHash, configuredHash);
}

/**
 * Find the configured key matching the presented token, comparing against
 * every key in constant time. Every configured key is checked (no early return
 * on a match) so total time does not depend on which key matched or how many
 * were tried before it.
 */
function matchKey(
  presented: string,
  configured: ConfiguredKey[]
): ConfiguredKey | null {
  let matched: ConfiguredKey | null = null;
  for (const entry of configured) {
    if (keysMatch(presented, entry.key)) {
      matched = entry;
    }
  }
  return matched;
}

/**
 * Express middleware factory guarding an internal service-to-service route.
 * Authenticates the caller by the static integration key and attaches
 * `req.serviceCaller = { label }` for the matched key.
 */
export function requireServiceAuth(): RequestHandler {
  return function requireServiceAuthHandler(
    req: RequestWithServiceCaller,
    res: Response,
    next: NextFunction
  ): void {
    // No configured key means no security boundary — fail closed (503) rather
    // than answer. Checked first so a misconfigured deployment answers 503,
    // never 401.
    const configuredKeys = getConfiguredKeys();
    if (configuredKeys.length === 0) {
      console.error(
        'Service auth: no INTERNAL_API_KEYS configured; failing closed'
      );
      res.status(503).json({
        message: 'Authentication service unavailable',
        error: 'auth_service_unavailable',
      });
      return;
    }

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({
        message: 'Authorization token required',
        error: 'missing_token',
      });
      return;
    }

    const matched = matchKey(token, configuredKeys);
    if (!matched) {
      res.status(401).json({
        message: 'Invalid integration key',
        error: 'invalid_token',
      });
      return;
    }

    req.serviceCaller = { label: matched.label };
    next();
  };
}
