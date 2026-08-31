import type { RequestHandler } from 'express';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The limiter counts in Redis via a rate-limit-redis store. Tests must not need
// a real server, so we replace that store with a tiny in-memory implementation
// of the express-rate-limit Store interface. This is the library's documented
// contract (increment / decrement / resetKey), so it is stable to mock against
// — unlike the internal Redis command shape.
const { counts } = vi.hoisted(() => ({ counts: new Map<string, number>() }));

vi.mock('rate-limit-redis', () => {
  class FakeRedisStore {
    windowMs = 60000;
    init(options: { windowMs: number }) {
      this.windowMs = options.windowMs;
    }
    async increment(key: string) {
      const totalHits = (counts.get(key) ?? 0) + 1;
      counts.set(key, totalHits);
      return { totalHits, resetTime: new Date(Date.now() + this.windowMs) };
    }
    async decrement(key: string) {
      counts.set(key, Math.max(0, (counts.get(key) ?? 0) - 1));
    }
    async resetKey(key: string) {
      counts.delete(key);
    }
  }
  return { RedisStore: FakeRedisStore };
});

// Redis health and configured-state are toggled per test to exercise the
// fail-closed and not-configured paths. getRedisClient is stubbed so
// constructing the (mocked) store never touches a real connection. It is a
// vi.fn(), not a plain arrow function, so tests can assert it was actually
// called -- that call is what a real process depends on to ever establish a
// connection and flip isRedisHealthy() true (see redis.ts); a middleware that
// skips it on an unhealthy start can never recover.
const getRedisClientMock = vi.fn(() => ({ call: () => Promise.resolve(null) }));

vi.mock('@send-backend/redis', () => ({
  isRedisHealthy: () =>
    (globalThis as { __rlHealthy?: boolean }).__rlHealthy ?? true,
  isRateLimitingEnabled: () =>
    (globalThis as { __rlEnabled?: boolean }).__rlEnabled ?? true,
  getRedisClient: () => getRedisClientMock(),
}));

// The limit tiers are read from env at config import time, so the small,
// test-friendly limits must be set before the modules under test are imported.
// Each test imports createRateLimiter fresh (after resetModules) so it picks up
// these values rather than the production defaults.
async function loadLimiterFactory() {
  vi.resetModules();
  vi.stubEnv('RL_AUTH_MAX', '3');
  vi.stubEnv('RL_READ_MAX', '3');
  const mod = await import('../../middleware/rate-limit');
  return mod.createRateLimiter;
}

function appWithLimiter(limiter: RequestHandler, attachUser?: string) {
  const app = express();
  app.use(express.json());
  if (attachUser) {
    // Simulate an upstream auth middleware populating the OIDC user.
    app.use((req, _res, next) => {
      (req as express.Request & { oidcUser?: { sub: string } }).oidcUser = {
        sub: attachUser,
      };
      next();
    });
  }
  app.get('/test', limiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe('rate-limit middleware', () => {
  beforeEach(() => {
    counts.clear();
    getRedisClientMock.mockClear();
    (globalThis as { __rlHealthy?: boolean }).__rlHealthy = true;
    (globalThis as { __rlEnabled?: boolean }).__rlEnabled = true;
  });

  it('allows requests under the limit and 429s once the limit is exceeded', async () => {
    const createRateLimiter = await loadLimiterFactory();
    const app = appWithLimiter(createRateLimiter('auth'));

    // Three requests are allowed (max = 3), the fourth is blocked.
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(200);

    const blocked = await request(app).get('/test');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('too_many_requests');
    // The library sets a Retry-After header so clients can back off.
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('counts per user, so one user hitting the limit does not affect another', async () => {
    const createRateLimiter = await loadLimiterFactory();
    const userA = appWithLimiter(createRateLimiter('read'), 'user-a');
    const userB = appWithLimiter(createRateLimiter('read'), 'user-b');

    // Exhaust user A's budget.
    await request(userA).get('/test').expect(200);
    await request(userA).get('/test').expect(200);
    await request(userA).get('/test').expect(200);
    await request(userA).get('/test').expect(429);

    // User B is untouched.
    await request(userB).get('/test').expect(200);
  });

  it('fails closed with 503 when Redis is configured but unavailable', async () => {
    const createRateLimiter = await loadLimiterFactory();
    const app = appWithLimiter(createRateLimiter('auth'));
    (globalThis as { __rlHealthy?: boolean }).__rlHealthy = false;

    const res = await request(app).get('/test');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('rate_limiter_unavailable');
  });

  it('still calls getRedisClient on a cold, unhealthy start, so the connection that would flip it healthy actually gets made', async () => {
    // Regression test: getRedisClient() is the ONLY thing that ever creates the
    // ioredis client and registers the 'ready' listener that flips
    // isRedisHealthy() true. RedisStore's own sendCommand only calls it when
    // ALREADY healthy (see rate-limit.ts), so on a fresh process (healthy ===
    // false, client === null) that path never runs it. If this middleware also
    // skipped the call while unhealthy, nothing in the process would ever call
    // getRedisClient() at all -- a permanent 503 with no way to recover, no
    // matter how reachable Redis actually is.
    const createRateLimiter = await loadLimiterFactory();
    const app = appWithLimiter(createRateLimiter('auth'));
    (globalThis as { __rlHealthy?: boolean }).__rlHealthy = false;

    await request(app).get('/test').expect(503);

    expect(getRedisClientMock).toHaveBeenCalled();
  });

  it('passes requests through when rate limiting is not configured (no REDIS_URL)', async () => {
    const createRateLimiter = await loadLimiterFactory();
    const app = appWithLimiter(createRateLimiter('auth'));
    // Not configured: rate limiting is off entirely (local dev, E2E/CI).
    (globalThis as { __rlEnabled?: boolean }).__rlEnabled = false;

    // Well past the limit of 3 -- every request still succeeds.
    for (let i = 0; i < 6; i++) {
      await request(app).get('/test').expect(200);
    }
  });

  it('resets the budget after the window passes, letting requests through again', async () => {
    const createRateLimiter = await loadLimiterFactory();
    const app = appWithLimiter(createRateLimiter('auth'));

    // Use up the budget.
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(200);
    await request(app).get('/test').expect(429);

    // Real Redis expires the counter key when the window elapses. Simulate that
    // by clearing the shared store the way the TTL would, then confirm the same
    // caller is allowed again.
    counts.clear();

    await request(app).get('/test').expect(200);
  });

  it('shares one budget across instances (counts in the shared store, not per instance)', async () => {
    const createRateLimiter = await loadLimiterFactory();
    // Two separate limiter instances stand in for two backend replicas. They
    // must draw from the same Redis-backed counter, so the per-user limit is
    // one shared budget rather than one budget per replica.
    const replicaA = appWithLimiter(createRateLimiter('read'), 'same-user');
    const replicaB = appWithLimiter(createRateLimiter('read'), 'same-user');

    // Spend the whole budget of 3 spread across both replicas.
    await request(replicaA).get('/test').expect(200);
    await request(replicaB).get('/test').expect(200);
    await request(replicaA).get('/test').expect(200);

    // The 4th request is blocked no matter which replica answers it -- proving
    // the limit was not counted separately per instance.
    await request(replicaB).get('/test').expect(429);
    await request(replicaA).get('/test').expect(429);
  });
});
