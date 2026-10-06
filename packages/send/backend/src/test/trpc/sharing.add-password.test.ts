import * as jwt from '@send-backend/auth/jwt';
import * as oidc from '@send-backend/auth/oidc';
import { updateAccessLink } from '@send-backend/models/sharing';
import { getUserByOIDCSubject } from '@send-backend/models/users';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharingRouter } from '../../trpc/sharing';

vi.mock('@send-backend/auth/jwt', () => ({
  validateJWT: vi.fn(),
}));

vi.mock('@send-backend/auth/oidc', () => ({
  extractBearerToken: vi.fn(),
  isAccessTokenRevoked: vi.fn(),
  validateOIDCToken: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {},
}));

vi.mock('@send-backend/models/sharing', () => ({
  deleteAccessLink: vi.fn(),
  getAccessLinkRetryCount: vi.fn(),
  incrementAccessLinkRetryCount: vi.fn(),
  updateAccessLink: vi.fn(),
}));

vi.mock('@send-backend/models/users', () => ({
  getUserByOIDCSubject: vi.fn(),
}));

vi.mock('@send-backend/models/verification', () => ({
  getEncryptedPassphrase: vi.fn(),
  storeEncryptedPassphrase: vi.fn(),
}));

vi.mock('@send-backend/ws/verify', () => ({
  verificationEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

const input = { linkId: 'link-1', password: 'hash' };
const baseCtx = {
  res: { setHeader: vi.fn() },
  authorization: null,
  cookies: { jwtToken: 'jwt', jwtRefreshToken: 'refresh' },
  oidcUser: null,
};

function caller(ctx: object) {
  //@ts-ignore
  return sharingRouter.createCaller(ctx);
}

describe('addPasswordToAccessLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(oidc.extractBearerToken).mockReturnValue(null);
    vi.mocked(oidc.isAccessTokenRevoked).mockResolvedValue(false);
    vi.mocked(jwt.validateJWT).mockReturnValue('valid');
  });

  it('rejects an unauthenticated caller without touching the link', async () => {
    vi.mocked(jwt.validateJWT).mockReturnValue(null);

    await expect(
      caller({ ...baseCtx, user: null }).addPasswordToAccessLink(input)
    ).rejects.toThrow(new TRPCError({ code: 'FORBIDDEN' }));
    expect(updateAccessLink).not.toHaveBeenCalled();
  });

  it('updates the link scoped to the calling user', async () => {
    vi.mocked(updateAccessLink).mockResolvedValue({
      id: 'link-1',
      passwordHash: 'hash',
    });

    const result = await caller({
      ...baseCtx,
      user: { id: 'owner-1' },
    }).addPasswordToAccessLink(input);

    expect(updateAccessLink).toHaveBeenCalledWith('link-1', 'hash', 'owner-1');
    expect(result).toEqual({ input, id: 'link-1', passwordHash: 'hash' });
  });

  it('uses the OIDC user when authenticated via OIDC', async () => {
    vi.mocked(oidc.extractBearerToken).mockReturnValue('oidc.token');
    vi.mocked(oidc.validateOIDCToken).mockResolvedValue({
      isValid: true,
      userInfo: { sub: 'oidc-sub' },
    } as Awaited<ReturnType<typeof oidc.validateOIDCToken>>);
    vi.mocked(getUserByOIDCSubject).mockResolvedValue({
      id: 'owner-oidc',
    } as Awaited<ReturnType<typeof getUserByOIDCSubject>>);
    vi.mocked(updateAccessLink).mockResolvedValue({
      id: 'link-1',
      passwordHash: 'hash',
    });

    await caller({ ...baseCtx, user: null }).addPasswordToAccessLink(input);

    expect(updateAccessLink).toHaveBeenCalledWith(
      'link-1',
      'hash',
      'owner-oidc'
    );
  });

  it('rejects an unregistered OIDC user even when the cookie names another user', async () => {
    // Valid OIDC token whose subject has no account, plus a forged JWT cookie
    // claiming to be the link owner. The cookie identity must not be used.
    vi.mocked(oidc.extractBearerToken).mockReturnValue('oidc.token');
    vi.mocked(oidc.validateOIDCToken).mockResolvedValue({
      isValid: true,
      userInfo: { sub: 'attacker-sub' },
    } as Awaited<ReturnType<typeof oidc.validateOIDCToken>>);
    vi.mocked(getUserByOIDCSubject).mockResolvedValue(null);

    await expect(
      caller({ ...baseCtx, user: { id: 'owner-1' } }).addPasswordToAccessLink(
        input
      )
    ).rejects.toThrow(new TRPCError({ code: 'FORBIDDEN' }));
    expect(updateAccessLink).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for a link in a container the caller doesn't own", async () => {
    vi.mocked(updateAccessLink).mockRejectedValue(new Error('NotFoundError'));

    await expect(
      caller({
        ...baseCtx,
        user: { id: 'not-the-owner' },
      }).addPasswordToAccessLink(input)
    ).rejects.toThrow(new TRPCError({ code: 'NOT_FOUND' }));
  });
});
