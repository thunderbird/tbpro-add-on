import { describe, expect, it, vi } from 'vitest';

// Guard coverage for routes/uploads.ts: every state-changing (POST/PUT/PATCH/
// DELETE) route must carry auth middleware. A route that mutates state without
// requireJWT is a regression; new such routes fail here until guarded or
// explicitly exempted with a reason below.

const { named } = vi.hoisted(() => {
  // Named passthroughs so we can recognize each guard by function name when we
  // walk the router's layer stack.
  const make = (name: string) => {
    const fn = (_req: unknown, _res: unknown, next: () => void) => next();
    Object.defineProperty(fn, 'name', { value: name });
    return fn;
  };
  return { named: make };
});

vi.mock('../../middleware', () => ({
  requireJWT: named('requireJWT'),
  requireAuth: named('requireAuth'),
  checkStorageLimit: named('checkStorageLimit'),
  getGroupMemberPermissions: named('getGroupMemberPermissions'),
  requireWritePermission: named('requireWritePermission'),
  requireReadPermission: named('requireReadPermission'),
  requireAdminPermission: named('requireAdminPermission'),
  requireSharePermission: named('requireSharePermission'),
  requireUploadAccess: named('requireUploadAccess'),
  requireAdminPermisions: named('requireAdminPermisions'),
}));

vi.mock('../../middleware/rate-limit', () => ({
  // A recognizable name so a rate-limit-only route is not mistaken for guarded.
  createRateLimiter: () => named('rateLimiter'),
}));

vi.mock('@send-backend/storage', () => ({
  default: { getUploadBucketUrl: vi.fn(), del: vi.fn() },
}));
vi.mock('@send-backend/models', () => ({
  deleteUploadsByIds: vi.fn(),
  reportUpload: vi.fn(),
}));
vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: vi.fn(() => ({ id: 'u', uniqueHash: 'h' })),
}));

import router from '../../routes/uploads';

// `requireUploadAccess` accepts a live share link or a signed-in member.
const AUTH_GUARDS = new Set([
  'requireJWT',
  'requireAuth',
  'requireUploadAccess',
]);
const MUTATING = new Set(['post', 'put', 'patch', 'delete']);

// Routes that intentionally mutate without an auth chain guard, each with the
// reason it is exempt. The companion assertion below requires every exempt
// route to STILL lack an auth guard, so an exemption dies the moment its route
// is guarded.
const AUTH_EXEMPT = new Map<string, string>([
  ['post /items', 'read-only fetch by id + wrapped key; no state change'],
]);

type GuardedRoute = { key: string; guards: string[] };

function collectMutatingRoutes(): GuardedRoute[] {
  const out: GuardedRoute[] = [];
  for (const layer of (router as unknown as { stack: any[] }).stack) {
    const route = layer.route;
    if (!route) continue;
    const methods = Object.keys(route.methods).filter((m) => MUTATING.has(m));
    if (methods.length === 0) continue;
    const guards: string[] = route.stack
      .map((s: any) => s.handle?.name)
      .filter(Boolean);
    for (const method of methods) {
      out.push({ key: `${method} ${route.path}`, guards });
    }
  }
  return out;
}

describe('routes/uploads.ts auth-guard coverage', () => {
  const routes = collectMutatingRoutes();

  it('finds at least the known mutating routes (stack walk sanity)', () => {
    const keys = routes.map((r) => r.key);
    expect(keys).toContain('post /');
    expect(keys).toContain('post /signed');
    expect(keys).toContain('post /cleanup');
    expect(keys).toContain('post /report');
  });

  it('pins the report routes: proof of access, rate limit, admin-only verdicts', () => {
    const guardsOf = (key: string) => routes.find((r) => r.key === key)?.guards;
    expect(guardsOf('post /report')).toEqual(
      expect.arrayContaining(['rateLimiter', 'requireUploadAccess'])
    );
    expect(guardsOf('post /:uploadId/report/:verdict(confirm|clear)')).toEqual(
      expect.arrayContaining([
        'requireJWT',
        'requireAdminPermisions',
        'rateLimiter',
      ])
    );
  });

  it('guards every mutating route that is not explicitly exempt', () => {
    const unguarded = routes
      .filter((r) => !AUTH_EXEMPT.has(r.key))
      .filter((r) => !r.guards.some((g) => AUTH_GUARDS.has(g)))
      .map((r) => r.key);
    expect(unguarded).toEqual([]);
  });

  it('keeps every AUTH_EXEMPT route genuinely unguarded (exemption tracks its fix)', () => {
    for (const [key] of AUTH_EXEMPT) {
      const route = routes.find((r) => r.key === key);
      if (!route) continue; // route removed — exemption is simply stale, not wrong.
      expect(route.guards.some((g) => AUTH_GUARDS.has(g))).toBe(false);
    }
  });
});
