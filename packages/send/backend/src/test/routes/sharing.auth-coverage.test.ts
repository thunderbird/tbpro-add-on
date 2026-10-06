/**
 * Guards against state-changing sharing endpoints that skip authentication
 * (GHSA-wmpm-w8x7-gj96). Every mutating Express route and tRPC procedure must
 * include an auth middleware, unless it is listed below with a reason.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@prisma/client', () => ({
  PrismaClient: class {},
}));

vi.mock('../../models/sharing', () => ({}));
vi.mock('../../models/users', () => ({}));
vi.mock('../../models/verification', () => ({}));
vi.mock('../../ws/verify', () => ({ verificationEmitter: {} }));
vi.mock('../../auth/client', () => ({}));
vi.mock('../../metrics', () => ({ useMetrics: () => ({}) }));
vi.mock('../../utils', () => ({}));
vi.mock('../../middleware/rate-limit', () => ({
  createRateLimiter: () => function rateLimiter() {},
}));

vi.mock('../../middleware', () => ({
  getAuthenticatedUserData: vi.fn(),
  getGroupMemberPermissions: function getGroupMemberPermissions() {},
  requireAdminPermission: function requireAdminPermission() {},
  requireAuth: function requireAuth() {},
  requireJWT: function requireJWT() {},
  requireSharePermission: function requireSharePermission() {},
}));

import { requireAuth, requireJWT } from '../../middleware';
import router from '../../routes/sharing';
import { isAuthed } from '../../trpc/middlewares';
import { sharingRouter } from '../../trpc/sharing';

const MUTATING_METHODS = ['post', 'put', 'patch', 'delete'];
const EXPRESS_AUTH = [requireAuth, requireJWT];

// Mutations that are intentionally reachable without logging in.
const PUBLIC_EXPRESS_ROUTES = new Set([
  // Link recipients answer the challenge before they have an account.
  'POST /:linkId/challenge',
]);
const PUBLIC_TRPC_MUTATIONS = new Set([
  // Link recipients hit this while entering the link password.
  'incrementPasswordRetryCount',
]);

type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: unknown }[];
  };
};

const expressRoutes = (router.stack as unknown as RouteLayer[]).flatMap(
  ({ route }) =>
    route
      ? Object.keys(route.methods)
          .filter((method) => MUTATING_METHODS.includes(method))
          .map((method) => ({
            key: `${method.toUpperCase()} ${route.path}`,
            handlers: route.stack.map((layer) => layer.handle),
          }))
      : []
);

type Procedure = { _def: { type: string; middlewares: unknown[] } };

const trpcMutations = Object.entries(
  sharingRouter._def.procedures as unknown as Record<string, Procedure>
)
  .filter(([, procedure]) => procedure._def.type === 'mutation')
  .map(([name, procedure]) => ({
    key: name,
    middlewares: procedure._def.middlewares,
  }));

describe('sharing endpoints require authentication', () => {
  it('finds the routes and procedures to check', () => {
    expect(expressRoutes.length).toBeGreaterThan(0);
    expect(trpcMutations.length).toBeGreaterThan(0);
  });

  it.each(
    expressRoutes.filter(({ key }) => !PUBLIC_EXPRESS_ROUTES.has(key))
  )('Express $key has requireAuth or requireJWT', ({ handlers }) => {
    expect(handlers.some((h) => EXPRESS_AUTH.includes(h as never))).toBe(true);
  });

  it.each(trpcMutations.filter(({ key }) => !PUBLIC_TRPC_MUTATIONS.has(key)))(
    'tRPC $key uses isAuthed',
    ({ middlewares }) => {
      expect(middlewares).toContain(isAuthed);
    }
  );

  it('only lists exemptions that still exist', () => {
    const expressKeys = expressRoutes.map(({ key }) => key);
    const trpcKeys = trpcMutations.map(({ key }) => key);

    expect(expressKeys).toEqual(
      expect.arrayContaining([...PUBLIC_EXPRESS_ROUTES])
    );
    expect(trpcKeys).toEqual(
      expect.arrayContaining([...PUBLIC_TRPC_MUTATIONS])
    );
  });
});
