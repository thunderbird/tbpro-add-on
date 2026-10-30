import * as jwt from '@send-backend/auth/jwt';
import * as oidc from '@send-backend/auth/oidc';
import {
  deleteContainer,
  deleteUpload,
  getContainersOwnedByUser,
  getUploadsOwnedByUser,
} from '@send-backend/models';
import { resetKeys } from '@send-backend/models/users';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usersRouter } from '../../trpc/users';
import { CLIENT_JWK } from '../fixtures/publicKeyJwk';

// Regression test for issue #1116 (safe "Reset Access"), router layer.
//
// The model swaps the new key blob in first; the router then deletes the old
// containers/uploads. Once the swap has committed, a cleanup failure must NOT
// be reported as a failed reset: the client would then never adopt or show the
// new passphrase, leaving a server blob nobody can open — a permanent lockout.
// Conversely, if the swap itself fails nothing may be deleted.

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

vi.mock('@send-backend/models', () => ({
  createLoginSession: vi.fn(),
  deleteContainer: vi.fn(),
  deleteUpload: vi.fn(),
  getContainersOwnedByUser: vi.fn(),
  getUploadsOwnedByUser: vi.fn(),
}));

vi.mock('@send-backend/models/users', () => ({
  createUserWithPassword: vi.fn(),
  getFTUEStatus: vi.fn(),
  getHashedPassword: vi.fn(),
  getUserByEmailV2: vi.fn(),
  getUserByOIDCSubject: vi.fn(),
  markFTUEComplete: vi.fn(),
  resetKeys: vi.fn(),
  updateUniqueHash: vi.fn(),
}));

const input = {
  publicKey: CLIENT_JWK,
  backupKeypair: 'new-encrypted-keypair',
  backupKeystring: 'new-password-wrapped-key',
  backupSalt: 'new-salt',
  backupContainerKeys: '{}',
};

const baseCtx = {
  res: { setHeader: vi.fn() },
  authorization: null,
  cookies: { jwtToken: 'jwt', jwtRefreshToken: 'refresh' },
  oidcUser: null,
  user: { id: 'user-1116' },
};

function caller(ctx: object) {
  //@ts-ignore
  return usersRouter.createCaller(ctx);
}

describe('resetKeys router — cleanup failure after a committed swap (#1116)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(oidc.extractBearerToken).mockReturnValue(null);
    vi.mocked(oidc.isAccessTokenRevoked).mockResolvedValue(false);
    vi.mocked(jwt.validateJWT).mockReturnValue('valid');
    vi.mocked(resetKeys).mockResolvedValue({ id: 'user-1116' } as never);
    vi.mocked(getContainersOwnedByUser).mockResolvedValue([
      { id: 'c-1', items: [] },
      { id: 'c-2', items: [] },
    ] as never);
    vi.mocked(getUploadsOwnedByUser).mockResolvedValue([
      { id: 'u-1' },
    ] as never);
    vi.mocked(deleteContainer).mockResolvedValue({} as never);
    vi.mocked(deleteUpload).mockResolvedValue({} as never);
  });

  it('swaps the blob in, deletes the old content, and reports success', async () => {
    const result = await caller(baseCtx).resetKeys(input);

    expect(resetKeys).toHaveBeenCalledWith('user-1116', input);
    expect(deleteContainer).toHaveBeenCalledTimes(2);
    expect(deleteUpload).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });

  it('still reports success when container cleanup fails after the swap', async () => {
    // e.g. another tab deleted the container first (Prisma P2025).
    vi.mocked(deleteContainer).mockRejectedValueOnce(
      new Error('Record to delete does not exist.')
    );

    const result = await caller(baseCtx).resetKeys(input);

    expect(resetKeys).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
    expect(console.error).toHaveBeenCalled();
  });

  it('still reports success when upload cleanup fails after the swap', async () => {
    vi.mocked(deleteUpload).mockRejectedValueOnce(new Error('boom'));

    await expect(caller(baseCtx).resetKeys(input)).resolves.toEqual({
      success: true,
    });
  });

  it('fails and deletes nothing when the swap itself fails', async () => {
    vi.mocked(resetKeys).mockRejectedValueOnce(new Error('USER_NOT_UPDATED'));

    await expect(caller(baseCtx).resetKeys(input)).rejects.toThrow(
      new TRPCError({
        code: 'UNPROCESSABLE_CONTENT',
        message: 'Could not reset keys',
      })
    );
    expect(getContainersOwnedByUser).not.toHaveBeenCalled();
    expect(deleteContainer).not.toHaveBeenCalled();
    expect(deleteUpload).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated caller without touching anything', async () => {
    vi.mocked(jwt.validateJWT).mockReturnValue(null);

    await expect(
      caller({ ...baseCtx, user: null }).resetKeys(input)
    ).rejects.toThrow(new TRPCError({ code: 'FORBIDDEN' }));
    expect(resetKeys).not.toHaveBeenCalled();
    expect(deleteContainer).not.toHaveBeenCalled();
  });
});

describe('resetKeys router — publicKey must be an RSA public key JWK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(oidc.extractBearerToken).mockReturnValue(null);
    vi.mocked(oidc.isAccessTokenRevoked).mockResolvedValue(false);
    vi.mocked(jwt.validateJWT).mockReturnValue('valid');
    vi.mocked(resetKeys).mockResolvedValue({ id: 'user-1116' } as never);
    vi.mocked(getContainersOwnedByUser).mockResolvedValue([] as never);
    vi.mocked(getUploadsOwnedByUser).mockResolvedValue([] as never);
  });

  it('passes the current client JWK string through unchanged', async () => {
    await caller(baseCtx).resetKeys(input);

    expect(resetKeys).toHaveBeenCalledWith('user-1116', input);
  });

  it.each([
    ['1', 1],
    ['true', true],
    ['null', null],
    ['[]', []],
    ['"x"', 'x'],
    ['"1"', '1'],
    ['{kty:"EC"}', { kty: 'EC' }],
    ['{kty:"EC"} as a string', '{"kty":"EC"}'],
  ])('rejects %s with BAD_REQUEST', async (_label, publicKey) => {
    await expect(
      caller(baseCtx).resetKeys({ ...input, publicKey } as never)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(resetKeys).not.toHaveBeenCalled();
  });
});
