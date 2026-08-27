import { createHash } from 'crypto';
import type { Request, RequestHandler, Response } from 'express';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { RATE_LIMITS, type RateLimitTier } from '../config';
import {
  getRedisClient,
  isRateLimitingEnabled,
  isRedisHealthy,
} from '../redis';

/**
 * Rate limiting for sensitive Send backend endpoints.
 *
 * One named limiter is created per tier (see RATE_LIMITS in config.ts) and
 * attached to routes as middleware. Counting happens in Redis so the limit is
 * shared across all backend instances rather than counted separately on each.
 *
 * Two behaviours are worth calling out because they are security decisions, not
 * defaults:
 *
 *  - Requests are keyed per user, not per IP, so one user hitting a limit never
 *    affects anyone else. Pre-auth routes (like token refresh) have no user yet,
 *    so those fall back to IP plus a hash of the refresh-token cookie.
 *
 *  - If Redis is configured but unreachable we reject with 503 (fail closed)
 *    instead of letting the request through. A limiter that quietly stops
 *    counting during an outage is exactly the condition an attacker would try
 *    to create. When Redis is not configured at all (local dev, E2E/CI) rate
 *    limiting is simply off and requests pass through -- see isRateLimitingEnabled.
 */

// Identify the caller for per-user limiting. Order matters: prefer the OIDC
// subject, then the legacy JWT user id, and only fall back to network identity
// for routes that run before authentication.
function keyForRequest(req: Request): string {
  // Populated by the OIDC auth middleware on authenticated routes.
  const oidcSub = (req as Request & { oidcUser?: { sub?: string } }).oidcUser
    ?.sub;
  if (oidcSub) {
    return `user:${oidcSub}`;
  }

  // Populated by the unified/JWT auth middleware on legacy authenticated routes.
  const jwtUserId = (req as Request & { authenticatedUser?: { id?: string } })
    .authenticatedUser?.id;
  if (jwtUserId) {
    return `user:${jwtUserId}`;
  }

  // Pre-auth routes (e.g. token refresh) have no user identity yet. Key on IP
  // plus a hash of the refresh-token cookie so a single source is limited
  // without lumping every user behind a shared NAT into one bucket. The cookie
  // is hashed, never stored in Redis in the clear.
  //
  // ipKeyGenerator normalises the client IP first: without it, IPv6 clients get
  // a distinct key per /128 address and could sidestep the limit by rotating
  // within their allocation. It collapses each client to its network prefix.
  const refreshCookie = req.headers?.cookie ?? '';
  const cookieHash = createHash('sha256')
    .update(refreshCookie)
    .digest('hex')
    .slice(0, 16);
  return `anon:${ipKeyGenerator(req.ip ?? '')}:${cookieHash}`;
}

/**
 * Build a rate limiter for a named tier.
 *
 * Usage: `router.get('/refresh', createRateLimiter('auth'), handler)`.
 */
export function createRateLimiter(tier: RateLimitTier): RequestHandler {
  const { windowMs, max } = RATE_LIMITS[tier];

  // Built once here, at route-registration time (not per request). Building it
  // per request is what express-rate-limit warns about (ERR_ERL_CREATED_IN_
  // REQUEST_HANDLER), and it would also discard the counters between requests.
  //
  // The RedisStore constructor kicks off a Lua-script load via sendCommand. We
  // must not let that reach Redis at construction time, because route files are
  // imported in tests and in environments with no Redis configured. So
  // sendCommand below is a no-op until Redis is both configured and reachable;
  // the per-request guard is what actually enforces (or 503s) once it is.
  const limiter = rateLimit({
    windowMs,
    max,
    // Key each named limiter's counters separately in Redis and namespace them
    // under `rl:` so this data is safe to share a Redis with other services.
    store: new RedisStore({
      prefix: `rl:${tier}:`,
      sendCommand: (command: string, ...args: string[]) => {
        // Only talk to Redis when it is configured and up. Otherwise resolve to
        // null so the store's script-load and any stray call are harmless; the
        // request-level guard has already decided pass-through or 503 by then.
        if (!isRateLimitingEnabled() || !isRedisHealthy()) {
          return Promise.resolve(null) as Promise<never>;
        }
        return getRedisClient().call(command, ...args) as Promise<never>;
      },
    }),
    keyGenerator: keyForRequest,
    // Emit the standard RateLimit-* headers so clients can back off proactively.
    standardHeaders: true,
    legacyHeaders: false,
    // Answer over-limit requests with 429 and a Retry-After hint. express-rate-
    // limit sets Retry-After automatically; we only shape the JSON body.
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        message: 'Too many requests. Please slow down and try again shortly.',
        error: 'too_many_requests',
      });
    },
  } as Partial<Options>);

  return (req, res, next) => {
    // Rate limiting is opt-in via REDIS_URL. Where Redis is not configured
    // (local dev, E2E/CI) the limiter is a no-op so those environments keep
    // working without a Redis to talk to.
    if (!isRateLimitingEnabled()) {
      next();
      return;
    }

    // Redis is configured but not currently reachable: fail closed with an
    // explicit, predictable 503 rather than letting the request through
    // unlimited. (express-rate-limit would otherwise surface the store error to
    // the generic error handler.)
    if (!isRedisHealthy()) {
      res.status(503).json({
        message: 'Service temporarily unavailable. Please try again shortly.',
        error: 'rate_limiter_unavailable',
      });
      return;
    }

    limiter(req, res, next);
  };
}
