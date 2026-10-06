import * as jwt from '@send-backend/auth/jwt';
import * as oidc from '@send-backend/auth/oidc';
import { getUserByOIDCSubject } from '@send-backend/models/users';
import { PermissionType, allPermissions } from '@send-backend/types/custom';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAuthenticatedUserId,
  getGroupMemberPermission,
  isAuthed,
} from '../../trpc/middlewares';

vi.mock('@send-backend/auth/jwt', () => ({
  validateJWT: vi.fn(),
}));

vi.mock('@send-backend/auth/oidc', () => ({
  extractBearerToken: vi.fn(),
  isAccessTokenRevoked: vi.fn(),
  validateOIDCToken: vi.fn(),
}));

const { mockGroupFind, mockMembershipFind } = vi.hoisted(() => ({
  mockGroupFind: vi.fn(),
  mockMembershipFind: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    group = { findFirstOrThrow: mockGroupFind };
    membership = { findUniqueOrThrow: mockMembershipFind };
  },
}));

vi.mock('@send-backend/models/users', () => ({
  getUserByOIDCSubject: vi.fn(),
}));

describe('Middleware tests', () => {
  const mockNext = vi.fn();
  const mockCtx = {
    cookies: {
      jwtToken: 'mock-jwt-token',
      jwtRefreshToken: 'mock-refresh-token',
    },
    user: {
      id: null,
      email: null,
      uniqueHash: null,
    },
  };

  describe('isAuthed middleware', () => {
    beforeEach(() => {
      // Default: no bearer token / not revoked, so these JWT-path tests behave
      // as before. The revocation test below overrides them.
      vi.mocked(oidc.extractBearerToken).mockReturnValue(null);
      vi.mocked(oidc.isAccessTokenRevoked).mockResolvedValue(false);
    });

    it('should call next() when JWT is valid', async () => {
      vi.mocked(jwt.validateJWT).mockReturnValue('valid');

      //@ts-ignore
      await isAuthed({ ctx: mockCtx, next: mockNext });

      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UNAUTHORIZED error when token needs refresh', async () => {
      vi.mocked(jwt.validateJWT).mockReturnValue('shouldRefresh');

      //@ts-ignore
      await expect(isAuthed({ ctx: mockCtx, next: mockNext })).rejects.toThrow(
        new TRPCError({ code: 'UNAUTHORIZED' })
      );
    });

    it('should throw FORBIDDEN error when token needs refresh', async () => {
      vi.mocked(jwt.validateJWT).mockReturnValue('shouldLogin');

      //@ts-ignore
      await expect(isAuthed({ ctx: mockCtx, next: mockNext })).rejects.toThrow(
        new TRPCError({ code: 'FORBIDDEN' })
      );
    });

    it('should throw FORBIDDEN error when validation fails', async () => {
      vi.mocked(jwt.validateJWT).mockReturnValue(null);

      //@ts-ignore
      await expect(isAuthed({ ctx: mockCtx, next: mockNext })).rejects.toThrow(
        new TRPCError({ code: 'FORBIDDEN' })
      );
    });

    it('throws FORBIDDEN and sets x-logout when the OIDC session is revoked (#960)', async () => {
      const setHeader = vi.fn();
      const ctx = {
        ...mockCtx,
        authorization: 'Bearer revoked.token',
        res: { setHeader },
      };
      vi.mocked(oidc.extractBearerToken).mockReturnValue('revoked.token');
      vi.mocked(oidc.isAccessTokenRevoked).mockResolvedValue(true);

      await expect(
        //@ts-ignore
        isAuthed({ ctx, next: mockNext })
      ).rejects.toThrow(new TRPCError({ code: 'FORBIDDEN' }));
      expect(setHeader).toHaveBeenCalledWith('x-logout', '1');
    });
  });

  describe('getGroupMemberPermission middleware', () => {
    const ctx = { ...mockCtx, user: { ...mockCtx.user, id: '1' } };
    const run = (input: unknown, context: object = ctx) =>
      getGroupMemberPermission({
        //@ts-ignore
        ctx: context,
        next: mockNext,
        getRawInput: async () => input,
      });

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(oidc.extractBearerToken).mockReturnValue(null);
      vi.mocked(oidc.isAccessTokenRevoked).mockResolvedValue(false);
      vi.mocked(jwt.validateJWT).mockReturnValue('valid');
    });

    it('throws FORBIDDEN and does not call next() when not authenticated', async () => {
      vi.mocked(jwt.validateJWT).mockReturnValue('shouldLogin');

      await expect(run({ containerId: 'c1' })).rejects.toThrow(
        new TRPCError({ code: 'FORBIDDEN' })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('throws UNAUTHORIZED when the token needs refresh', async () => {
      vi.mocked(jwt.validateJWT).mockReturnValue('shouldRefresh');

      await expect(run({ containerId: 'c1' })).rejects.toThrow(
        new TRPCError({ code: 'UNAUTHORIZED' })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('throws FORBIDDEN when there is no authenticated user', async () => {
      await expect(run({ containerId: 'c1' }, mockCtx)).rejects.toThrow(
        new TRPCError({ code: 'FORBIDDEN' })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('grants all permissions when no containerId is given', async () => {
      await run({});

      expect(mockGroupFind).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith({
        ctx: { ...ctx, permission: allPermissions() },
      });
    });

    it("adds the user's membership permission for the container", async () => {
      mockGroupFind.mockResolvedValue({ id: 7 });
      mockMembershipFind.mockResolvedValue({ permission: PermissionType.READ });

      await run({ containerId: 'c1' });

      expect(mockGroupFind).toHaveBeenCalledWith({
        where: { container: { id: 'c1' } },
      });
      expect(mockMembershipFind).toHaveBeenCalledWith({
        where: { groupId_userId: { groupId: 7, userId: '1' } },
      });
      expect(mockNext).toHaveBeenCalledWith({
        ctx: { ...ctx, permission: PermissionType.READ },
      });
    });

    it('uses the OIDC user when authenticated via OIDC', async () => {
      vi.mocked(oidc.extractBearerToken).mockReturnValue('oidc.token');
      vi.mocked(oidc.validateOIDCToken).mockResolvedValue({
        isValid: true,
        userInfo: { sub: 'oidc-sub' },
      } as Awaited<ReturnType<typeof oidc.validateOIDCToken>>);
      vi.mocked(getUserByOIDCSubject).mockResolvedValue({
        id: '42',
      } as Awaited<ReturnType<typeof getUserByOIDCSubject>>);
      mockGroupFind.mockResolvedValue({ id: 7 });
      mockMembershipFind.mockResolvedValue({ permission: PermissionType.READ });

      await run({ containerId: 'c1' });

      expect(getUserByOIDCSubject).toHaveBeenCalledWith('oidc-sub');
      expect(mockMembershipFind).toHaveBeenCalledWith({
        where: { groupId_userId: { groupId: 7, userId: '42' } },
      });
    });

    it('throws FORBIDDEN when the user is not a member of the container group', async () => {
      mockGroupFind.mockResolvedValue({ id: 7 });
      mockMembershipFind.mockRejectedValue(new Error('NotFoundError'));

      await expect(run({ containerId: 'c1' })).rejects.toThrow(
        new TRPCError({ code: 'FORBIDDEN' })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('throws FORBIDDEN when the container has no group', async () => {
      mockGroupFind.mockRejectedValue(new Error('NotFoundError'));

      await expect(run({ containerId: 'c1' })).rejects.toThrow(
        new TRPCError({ code: 'FORBIDDEN' })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});

describe('getAuthenticatedUserId', () => {
  const baseCtx = {
    cookies: { jwtToken: 'jwt', jwtRefreshToken: 'refresh' },
    user: { id: 'cookie-user', email: null, uniqueHash: null },
    oidcUser: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the database id for a registered OIDC user', async () => {
    vi.mocked(getUserByOIDCSubject).mockResolvedValue({
      id: 'db-user',
    } as Awaited<ReturnType<typeof getUserByOIDCSubject>>);

    //@ts-ignore
    const id = await getAuthenticatedUserId({
      ...baseCtx,
      oidcUser: { sub: 'oidc-sub' },
    });

    expect(id).toBe('db-user');
    expect(getUserByOIDCSubject).toHaveBeenCalledWith('oidc-sub');
  });

  it('throws FORBIDDEN instead of falling back to the cookie user when the OIDC user is unregistered', async () => {
    vi.mocked(getUserByOIDCSubject).mockResolvedValue(null);

    await expect(
      //@ts-ignore
      getAuthenticatedUserId({ ...baseCtx, oidcUser: { sub: 'oidc-sub' } })
    ).rejects.toThrow(new TRPCError({ code: 'FORBIDDEN' }));
  });

  it('throws FORBIDDEN when the OIDC user lookup fails', async () => {
    vi.mocked(getUserByOIDCSubject).mockRejectedValue(new Error('db down'));

    await expect(
      //@ts-ignore
      getAuthenticatedUserId({ ...baseCtx, oidcUser: { sub: 'oidc-sub' } })
    ).rejects.toThrow(new TRPCError({ code: 'FORBIDDEN' }));
  });

  it('falls back to the JWT user when there is no OIDC identity', async () => {
    //@ts-ignore
    const id = await getAuthenticatedUserId(baseCtx);

    expect(id).toBe('cookie-user');
    expect(getUserByOIDCSubject).not.toHaveBeenCalled();
  });

  it('returns null when there is no identity at all', async () => {
    //@ts-ignore
    const id = await getAuthenticatedUserId({ ...baseCtx, user: null });

    expect(id).toBeNull();
  });
});
