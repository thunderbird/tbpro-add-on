# Design Doc: Redis-backed Rate Limiting for the Send Backend

**Issue:** [thunderbird/tbpro-add-on#1072](https://github.com/thunderbird/tbpro-add-on/issues/1072)
**Status:** Draft for review
**Author:** aaspinwall
**Date:** 2026-08-27

---

## 1. Objective

Add rate limiting to all sensitive Send **backend** API endpoints, enforced consistently across all backend instances via a shared Redis store, to close the outstanding CodeQL `js/missing-rate-limiting` alerts without disrupting normal user activity.

Success criteria:

- All 23 open `js/missing-rate-limiting` alerts closed.
- Limits enforced globally (not per-instance) via Redis.
- Per-user keying, limits centralized in config, tunable without a code change.
- Standard `429` + retry guidance; frontend backs off gracefully.
- Automated tests proving limits trigger.

---

## 2. Current State (verified in code)

- **Framework:** Express 4 (`packages/send/backend`), TypeScript. Uses `helmet`; **no Redis today**.
- **Auth:** Two identity sources on flagged routes:
  - `requireOIDCAuth` → `req.oidcUser.sub` (OIDC).
  - `requireJWT` → JWT-derived user id (legacy).
  - One route (`auth.ts /refresh`) is **unauthenticated** — it reads a refresh-token cookie; must key on cookie/IP.
- **Config:** central `src/config.ts` — natural home for limit values.
- **Wiring:** middleware registered per route group in `src/index.ts` (`app.use('/api/...', router)`). `app.set('trust proxy', 1)` already set (correct client IP behind proxy).
- **Tests:** `src/test/routes/*` with vitest + integration config already present.

### Flagged endpoints (23, from CodeQL API)

| File | Count | Notable |
|---|---|---|
| `routes/containers.ts` | 16 | bulk of alerts (#8–23) |
| `routes/sharing.ts` | 3 | incl. **alert #27** (`GET /:uploadId/links`) |
| `routes/auth.ts` | 1 | `GET /refresh` — **unauthenticated**, highest brute-force risk (#6) |
| `routes/oidc-auth.ts` | 1 | `GET /oidc/me` (#42) |
| `routes/tags.ts` | 1 | #28 |
| `routes/uploads.ts` | 1 | `POST /` upload create (#38) |

All are `js/missing-rate-limiting`: "route handler performs authorization, but is not rate-limited."

---

## 3. Org Reference: thunderbird-accounts

Checked the sibling repo directly. **It is Django/Python, not Node** — so it is a *conceptual* reference only, not a copyable code pattern.

- Rate limiting = **DRF throttling** (`throttle_classes` + `DEFAULT_THROTTLE_RATES`), backed by Django's cache pointed at Redis. No standalone rate-limit library.
- **Redis client:** `redis==5.2.1` (pinned by Celery 5.5.3) + `hiredis`. This is the *Python client*, not the server version.
- **Redis server (dev):** `redis/redis-stack` image (also serves Celery broker + RedisInsight). Send needs none of the Stack modules — plain Redis suffices.

**Portable conventions to mirror:** one named limiter per endpoint; keyed per user; limit values centralized in config; Redis as the single shared counter store.

---

## 4. Proposed Node/Express Implementation

Idiomatic Node equivalents of the accounts pattern:

- **Redis client:** `ioredis` (mature, cluster-ready, TLS support).
- **Limiter:** `express-rate-limit` + `rate-limit-redis` store (the closest analog to DRF named throttles with a shared backend).
- **Redis server:** plain **Redis 7.x**, pinned minor (e.g. `redis:7.4`) — not the unpinned `redis-stack` tag.

### 4.1 Components

1. **`src/redis.ts`** — singleton `ioredis` client from `REDIS_URL`. Connection health tracked for the fail-closed decision (§5).
2. **`src/middleware/rate-limit.ts`** — `createRateLimiter(name)` factory:
   - `store`: `rate-limit-redis` using the shared client, prefix `rl:<name>:`.
   - `keyGenerator`: `req.oidcUser?.sub` → JWT user id → for pre-auth `/refresh`: `req.ip` + SHA-256(refresh-token cookie).
  - `store` prefix `rl:` (safe on a shared Redis); server `redis:7.4`, TLS in prod.
   - reads `{ windowMs, max }` from central config by `name`.
   - `handler`: `429` JSON `{ error: 'too_many_requests', retryAfter }` + `Retry-After` and standard `RateLimit-*` headers.
   - `standardHeaders: true`, `legacyHeaders: false`.
3. **`src/config.ts` → `RATE_LIMITS`** — named map, env-overridable, mirroring `DEFAULT_THROTTLE_RATES`:
   ```ts
   RATE_LIMITS = {
     read:      { windowMs: 60_000, max: 100 },  // high-frequency GETs (containers reads, /oidc/me)
     sensitive: { windowMs: 60_000, max: 30 },   // mutations (create/delete/share)
     auth:      { windowMs: 60_000, max: 10 },    // /refresh — tightest
   }
   ```
   Each overridable via `RL_<NAME>_MAX` / `RL_<NAME>_WINDOW_MS`.
4. **Apply per-endpoint** as route-level middleware, categorized read vs sensitive vs auth.
5. **Tests** — vitest integration: N+1 requests → assert 429, headers, and that a different user key is unaffected.
6. **Frontend** — API client detects 429, respects `Retry-After`, surfaces a non-fatal "slow down" state.

### 4.2 Rollout (phased, mechanism built once)

- **Phase 0:** infra Redis provisioned (✅ confirmed with infra), `ioredis` client, config scaffold.
- **Phase 1:** limiter factory + wire the two auth routes (`/refresh` #6, `/oidc/me` #42) — highest risk. Close those alerts.
- **Phase 2:** sharing (#25–27) + uploads (#38) + tags (#28).
- **Phase 3:** containers (#8–23) — largest batch; categorize each read/mutation.
- **Phase 4:** frontend 429 handling + docs.

---

## 5. Fail-Closed Behavior (decided)

If Redis is unavailable, rate-limited endpoints return **`503 Service Unavailable`** (fail closed). Rationale: a security control that silently disables itself under load/outage is the exact condition an attacker would induce.

**Resolved:** strict fail-closed on **all** limited routes (reads included). The GET-fail-open split is deferred as a premature optimization; revisit only if a Redis outage on browsing proves painful in practice.

**Implications & mitigations:**

- Redis becomes a **hard availability dependency** for these endpoints → this is why infra sign-off (done) matters, and argues for an HA/managed Redis.
- Add a startup readiness check and health-endpoint signal for Redis.
- Trade-off noted: strict fail-closed makes Redis a hard dependency for browsing too — accepted, mitigated by HA/managed Redis.

---

## 6. Trade-off Analysis: Two Approaches

The core decision is **how** the shared limiter is implemented. Both use Redis + `ioredis`, per-user keys, central config, 429s, fail-closed — they differ in the counting mechanism.

### Approach A — Library: `express-rate-limit` + `rate-limit-redis` (recommended)

Off-the-shelf middleware; the Redis store does atomic `INCR`/`EXPIRE` (fixed-window, with a sliding option).

**Pros**
- Minimal code; battle-tested; maintained.
- Built-in `RateLimit-*` / `Retry-After` headers, `keyGenerator`, `handler` hooks.
- Named-limiter-per-endpoint maps cleanly to accounts' `DEFAULT_THROTTLE_RATES`.
- Fast to ship; low review surface; easy per-route application.

**Cons**
- Two new deps (+ transitive).
- Default algorithm is fixed-window (burst at window edges); mitigated by the lib's sliding-window option or accepting minor edge bursts.
- Custom fail-closed needs a small store wrapper/error hook (the lib doesn't fail-closed by default).

### Approach B — Custom middleware on `ioredis` (Lua token bucket / sliding window)

Hand-rolled limiter: one Lua script per check for atomic sliding-window or token-bucket counting.

**Pros**
- Full control of algorithm (true sliding window / token bucket, smoother limiting).
- One fewer third-party dep (only `ioredis`).
- Fail-closed and key logic are explicit in our code.

**Cons**
- More code to write, test, and maintain (Lua + edge cases: clock, expiry, races).
- Re-implements a solved problem; higher review/bug surface.
- Diverges from the "reusable, consistent, off-the-shelf" spirit; slower to ship all 23.

### Recommendation

**Approach A.** It matches the issue's "reusable, consistent approach" goal, ships fastest across 23 endpoints, and gives standard headers for free. Wrap the store so Redis errors → **fail closed (503)**, and enable the sliding-window option on the `auth`/`sensitive` tiers where edge bursts matter most. Reserve Approach B only if a limiter tier later needs token-bucket semantics the library can't express.

---

## 7. Resolved Decisions (industry-standard defaults)

All four prior open questions resolved with standard defaults; none block implementation. Every value is env-overridable for post-deploy tuning.

1. **Fail-closed granularity:** strict fail-closed (503) on **all** limited routes, reads included. Split deferred (§5).
2. **Redis topology:** dedicated **Redis 7.x** with TLS in prod; keyspace prefix `rl:` always applied so consolidation onto a shared instance stays safe.
3. **`/refresh` keying:** **IP + hashed refresh-token cookie** — standard pre-auth brute-force keying; avoids NAT collateral of IP-only while still limiting per-source.
4. **Limit values (starting tiers):** `auth` 10/min, `read` 100/min, `sensitive` 30/min. Conservative, well above realistic single-user peak; tune from metrics/Sentry after rollout via `RL_*` env overrides.

---

## 8. Test Plan

- Unit: `keyGenerator` precedence (oidc → jwt → ip); config env-override parsing.
- Integration (vitest): burst past `max` → 429 + `Retry-After`; second user key unaffected; window reset restores access.
- Fail-closed: Redis client forced down → 503 on a limited route.
- Frontend: 429 handled without a hard error; respects `Retry-After`.

---

## 9. Dependencies & Infra

- npm: `ioredis`, `express-rate-limit`, `rate-limit-redis`.
- Infra: Redis 7.x reachable via `REDIS_URL` (+ TLS in prod), HA recommended given fail-closed. **Confirmed available with infra.**
- Env: `REDIS_URL`, optional `RL_*` overrides.
