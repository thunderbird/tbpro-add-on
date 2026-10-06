import { Router } from 'express';
import { describe, expect, it, vi } from 'vitest';

/**
 * Route-guard regression test.
 *
 * Every state-changing (POST/PUT/PATCH/DELETE) route on the sharing and
 * containers routers must carry an authentication middleware and an
 * ownership/permission middleware. The expected tables below pin the exact
 * guard chain of every mutating route, so weakening a chain — or adding a new
 * mutating route without guards — fails this test and forces a conscious
 * decision.
 *
 * Known-exempt routes are listed explicitly with the reason. A companion
 * assertion verifies each exemption is still real, so once an exempt route is
 * hardened the exemption must be deleted here.
 */

const { named } = vi.hoisted(() => ({
  named: (name: string) => {
    const fn = (_req: unknown, _res: unknown, next: () => void) => next();
    Object.defineProperty(fn, 'name', { value: name });
    return fn;
  },
}));

// Middleware doubles keep their real export names so the route chains can be
// inspected by name without a database or auth backend.
vi.mock('../../middleware', () => ({
  requireJWT: named('requireJWT'),
  requireAuth: named('requireAuth'),
  getAuthenticatedUserData: vi.fn(),
  renameBodyProperty: () => named('renameBodyProperty'),
  getGroupMemberPermissions: named('getGroupMemberPermissions'),
  requireReadPermission: named('requireReadPermission'),
  requireWritePermission: named('requireWritePermission'),
  requireAdminPermission: named('requireAdminPermission'),
  requireSharePermission: named('requireSharePermission'),
}));

vi.mock('../../middleware/rate-limit', () => ({
  createRateLimiter: (tier: string) => named(`rateLimiter(${tier})`),
}));

// The routers only need their imports to resolve; no handler is invoked.
vi.mock('../../models', () => ({
  removeInvitationAndGroup: vi.fn(),
  reportUpload: vi.fn(),
  addGroupMember: vi.fn(),
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  getContainerInfo: vi.fn(),
  getContainerWithDescendants: vi.fn(),
  getContainerWithMembers: vi.fn(),
  getSharesForContainer: vi.fn(),
  getWrappedKeyFromId: vi.fn(),
  removeGroupMember: vi.fn(),
  updateAccessLinkPermissions: vi.fn(),
  updateInvitationPermissions: vi.fn(),
  updateItemName: vi.fn(),
}));

vi.mock('../../models/sharing', () => ({
  acceptAccessLink: vi.fn(),
  acceptInvitation: vi.fn(),
  burnEphemeralConversation: vi.fn(),
  burnFolder: vi.fn(),
  checkIfAccessLinkCanBeCreated: vi.fn(),
  createAccessLink: vi.fn(),
  createInvitation: vi.fn(),
  createInvitationFromAccessLink: vi.fn(),
  getAccessLinkChallenge: vi.fn(),
  getAccessLinksByUploadId: vi.fn(),
  getAccessLinksByUploadIdAndWrappedKey: vi.fn(),
  getContainerForAccessLink: vi.fn(),
  isAccessLinkValid: vi.fn(),
  removeAccessLink: vi.fn(),
  resetAccessLinkRetryCount: vi.fn(),
  updateAccessLink: vi.fn(),
}));

vi.mock('../../models/containers', () => ({
  createContainer: vi.fn(),
  getAccessLinksForContainer: vi.fn(),
  getContainerWithAncestors: vi.fn(),
  getItemsInContainer: vi.fn(),
  updateContainerName: vi.fn(),
}));

vi.mock('@send-backend/auth/client', () => ({
  getDataFromAuthenticatedRequest: vi.fn(),
  getStorageLimit: vi.fn(),
}));

vi.mock('@send-backend/storage', () => ({
  default: { del: vi.fn() },
}));

vi.mock('@send-backend/utils', () => ({
  addExpiryToContainer: (c: unknown) => c,
  formatAccessLinkWithPasswordHash: (l: unknown) => l,
}));

vi.mock('@send-backend/metrics', () => ({
  useMetrics: () => ({ capture: vi.fn() }),
}));

import containersRouter from '../../routes/containers';
import sharingRouter from '../../routes/sharing';

const MUTATING_METHODS = ['post', 'put', 'patch', 'delete'];
const GUARD_NAME =
  /^(requireJWT|requireAuth|getGroupMemberPermissions|require(Read|Write|Admin|Share)Permission|rateLimiter\(.+\))$/;
const AUTH_GUARDS = ['requireJWT', 'requireAuth', 'getGroupMemberPermissions'];
const PERMISSION_GUARDS = [
  'requireReadPermission',
  'requireWritePermission',
  'requireAdminPermission',
  'requireSharePermission',
];

/** Collect `METHOD path` -> [recognized guard middleware names] for a router. */
function mutatingRouteGuards(router: Router): Record<string, string[]> {
  const chains: Record<string, string[]> = {};
  for (const layer of (router as unknown as { stack: unknown[] }).stack as {
    route?: {
      path: string;
      methods: Record<string, boolean>;
      stack: { handle: { name?: string } }[];
    };
  }[]) {
    if (!layer.route) continue;
    const methods = Object.keys(layer.route.methods).filter((m) =>
      MUTATING_METHODS.includes(m)
    );
    for (const method of methods) {
      chains[`${method.toUpperCase()} ${layer.route.path}`] = layer.route.stack
        .map((l) => l.handle.name ?? '')
        .filter((name) => GUARD_NAME.test(name));
    }
  }
  return chains;
}

const EXPECTED_SHARING: Record<string, string[]> = {
  'POST /': [
    'requireJWT',
    'getGroupMemberPermissions',
    'requireSharePermission',
    'rateLimiter(sensitive)',
  ],
  'POST /:linkId/challenge': [],
  'POST /:linkId/member/accept': ['requireJWT', 'rateLimiter(sensitive)'],
  'POST /:linkId/add-password': [],
};

const EXPECTED_CONTAINERS: Record<string, string[]> = {
  'POST /': [
    'requireJWT',
    'getGroupMemberPermissions',
    'requireWritePermission',
    'rateLimiter(sensitive)',
  ],
  'DELETE /:containerId': [
    'requireJWT',
    'getGroupMemberPermissions',
    'requireAdminPermission',
    'rateLimiter(sensitive)',
  ],
  'POST /:containerId/item': [
    'getGroupMemberPermissions',
    'rateLimiter(sensitive)',
  ],
  'DELETE /:containerId/item/:itemId': [
    'getGroupMemberPermissions',
    'rateLimiter(sensitive)',
  ],
  'POST /:containerId/item/:itemId/rename': [
    'getGroupMemberPermissions',
    'rateLimiter(sensitive)',
  ],
  'POST /:containerId/member': [
    'getGroupMemberPermissions',
    'requireAdminPermission',
    'rateLimiter(sensitive)',
  ],
  'POST /:containerId/member/invite': [
    'getGroupMemberPermissions',
    'rateLimiter(sensitive)',
  ],
  'DELETE /:containerId/member/:userId': [
    'getGroupMemberPermissions',
    'rateLimiter(sensitive)',
  ],
  'DELETE /:containerId/member/remove/:invitationId': [
    'getGroupMemberPermissions',
    'requireSharePermission',
  ],
  'POST /:containerId/rename': [
    'requireJWT',
    'getGroupMemberPermissions',
    'requireWritePermission',
    'rateLimiter(sensitive)',
  ],
  'POST /:containerId/report': [],
  'POST /:containerId/shares/accessLink/update': [
    'getGroupMemberPermissions',
    'rateLimiter(sensitive)',
  ],
  'POST /:containerId/shares/invitation/update': [
    'getGroupMemberPermissions',
    'rateLimiter(sensitive)',
  ],
};

// Routes intentionally or historically without an authentication guard.
// Companion assertions below verify these are still unguarded; remove the
// entry when the route gains its guard.
const AUTH_EXEMPT: Record<string, string> = {
  'POST /:linkId/challenge':
    'public by design: recipients answer the link challenge before login',
  'POST /:linkId/add-password':
    'compatibility no-op: accepts and ignores the body, writes nothing',
  'POST /:containerId/report':
    'abuse reporting is reachable without an account',
};

// Routes without a permission middleware. Same companion rule as above:
// remove the entry when the route gains a permission guard.
const PERMISSION_EXEMPT: Record<string, string> = {
  'POST /:linkId/challenge':
    'public by design: the challenge answer is itself the proof of access',
  'POST /:linkId/add-password':
    'compatibility no-op: accepts and ignores the body, writes nothing',
  'POST /:linkId/member/accept':
    'proof of access (link validity + challenge response) is enforced inside the handler',
  'POST /:containerId/item': 'pre-existing: any member may add items',
  'DELETE /:containerId/item/:itemId':
    'pre-existing: any member may delete items',
  'POST /:containerId/item/:itemId/rename':
    'pre-existing: any member may rename items',
  'POST /:containerId/member/invite':
    'pre-existing: membership-gated only; consider an admin gate',
  'DELETE /:containerId/member/:userId':
    'pre-existing: membership-gated only; consider an admin gate',
  'POST /:containerId/report':
    'abuse reporting is reachable without an account',
  'POST /:containerId/shares/accessLink/update':
    'pre-existing: membership-gated only; consider an admin gate',
  'POST /:containerId/shares/invitation/update':
    'pre-existing: membership-gated only; consider an admin gate',
};

describe('mutating route guards', () => {
  const actual = {
    ...mutatingRouteGuards(sharingRouter),
    ...mutatingRouteGuards(containersRouter),
  };

  it('sharing router chains match the pinned table', () => {
    expect(mutatingRouteGuards(sharingRouter)).toEqual(EXPECTED_SHARING);
  });

  it('containers router chains match the pinned table', () => {
    expect(mutatingRouteGuards(containersRouter)).toEqual(EXPECTED_CONTAINERS);
  });

  it('every mutating route authenticates the caller unless exempt', () => {
    for (const [route, guards] of Object.entries(actual)) {
      const hasAuth = guards.some((g) => AUTH_GUARDS.includes(g));
      if (route in AUTH_EXEMPT) {
        expect(
          hasAuth,
          `${route} is exempt but now has an auth guard; remove the exemption`
        ).toBe(false);
      } else {
        expect(hasAuth, `${route} has no authentication middleware`).toBe(true);
      }
    }
  });

  it('every mutating route checks permissions unless exempt', () => {
    for (const [route, guards] of Object.entries(actual)) {
      const hasPermission = guards.some((g) => PERMISSION_GUARDS.includes(g));
      if (route in PERMISSION_EXEMPT) {
        expect(
          hasPermission,
          `${route} is exempt but now has a permission guard; remove the exemption`
        ).toBe(false);
      } else {
        expect(hasPermission, `${route} has no permission middleware`).toBe(
          true
        );
      }
    }
  });
});
