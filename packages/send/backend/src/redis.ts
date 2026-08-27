import Redis from 'ioredis';

/**
 * Shared Redis client for the Send backend.
 *
 * The backend runs as multiple instances behind a load balancer. Rate limiting
 * has to be counted in one shared place, otherwise each instance keeps its own
 * counter and the effective limit is multiplied by the number of instances.
 * Redis is that shared place — every instance talks to the same server, so a
 * per-user limit means the same thing no matter which instance answers.
 *
 * This is the only Redis dependency in the backend today; it exists purely for
 * rate limiting. If Redis is unreachable, `isRedisHealthy()` returns false and
 * the rate limiter fails closed (see middleware/rate-limit.ts).
 */

// A single connection is created lazily on first use and reused for the life of
// the process. ioredis handles reconnection on its own.
let client: Redis | null = null;

// Tracks the live connection state so the rate limiter can decide, per request,
// whether Redis can be trusted right now. ioredis emits 'ready' once a
// connection is usable and 'end'/'error' when it is not.
let healthy = false;

/**
 * Returns the shared Redis client, creating it on first call.
 *
 * REDIS_URL is required in every environment that enables rate limiting. In
 * prod it should be a rediss:// URL so the connection is encrypted in transit.
 */
export function getRedisClient(): Redis {
  if (client) {
    return client;
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    // Failing loudly here is deliberate: a missing URL means rate limiting
    // would silently not work, which is the exact gap this project closes.
    throw new Error(
      'REDIS_URL is not set. The Send backend needs Redis for rate limiting.'
    );
  }

  client = new Redis(url, {
    // Every rate-limit key we write is namespaced under `rl:` so this instance
    // stays safe to share with other services on the same Redis if infra ever
    // consolidates. The key prefix itself is applied by the limiter store.
    // These options keep a Redis hiccup from turning into a slow request:
    // fail fast and let the fail-closed handler return 503 instead of hanging.
    maxRetriesPerRequest: 1,
    // Do not queue commands while disconnected; a queued command that resolves
    // seconds later is worse than a fast failure the limiter can act on.
    enableOfflineQueue: false,
  });

  client.on('ready', () => {
    healthy = true;
  });
  const markDown = () => {
    healthy = false;
  };
  client.on('end', markDown);
  client.on('error', markDown);

  return client;
}

/**
 * Whether Redis is currently usable.
 *
 * The rate limiter checks this before each limited request. When Redis is down
 * we fail closed (503) rather than fail open, because a rate limiter that
 * quietly stops counting during an outage is exactly what an attacker would try
 * to cause.
 */
export function isRedisHealthy(): boolean {
  return healthy;
}
