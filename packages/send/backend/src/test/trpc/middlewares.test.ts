import * as jwt from '@send-backend/auth/jwt';
import * as oidc from '@send-backend/auth/oidc';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGroupMemberPermission, isAuthed } from '../../trpc/middlewares';

vi.mock('@send-backend/auth/jwt', () => ({
  validateJWT: vi.fn(),
}));

vi.mock('@send-backend/auth/oidc', () => ({
  extractBearerToken: vi.fn(),
  isAccessTokenRevoked: vi.fn(),
  validateOIDCToken: vi.fn(),
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
    it('should call next()', async () => {
      //@ts-ignore
      await getGroupMemberPermission({ ctx: mockCtx, next: mockNext });
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
