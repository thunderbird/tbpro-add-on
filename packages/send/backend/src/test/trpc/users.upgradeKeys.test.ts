import * as jwt from '@send-backend/auth/jwt';
import * as oidc from '@send-backend/auth/oidc';
import {
  BACKUP_FORMAT_SUPERSEDED,
  BaseError,
  KEY_UPGRADE_STALE,
} from '@send-backend/errors/models';
import {
  assertLegacyBackupWritable,
  getBackupVersion,
  resetKeys,
  upgradeKeys,
} from '@send-backend/models/users';
import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usersRouter } from '../../trpc/users';

// Key backup v2, router layer: input validation, the KEY_BACKUP_V2_MODE gate,
// error mapping for upgradeKeys, the resetKeys downgrade guard, and the
// keyBackupV2 block on the settings query.

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
  getContainersOwnedByUser: vi.fn().mockResolvedValue([]),
  getUploadsOwnedByUser: vi.fn().mockResolvedValue([]),
}));

vi.mock('@send-backend/models/users', () => ({
  assertLegacyBackupWritable: vi.fn(),
  createUserWithPassword: vi.fn(),
  getBackupVersion: vi.fn(),
  getFTUEStatus: vi.fn(),
  getHashedPassword: vi.fn(),
  getUserByEmailV2: vi.fn(),
  getUserById: vi.fn(),
  getUserByOIDCSubject: vi.fn(),
  markFTUEComplete: vi.fn(),
  resetKeys: vi.fn(),
  updateUniqueHash: vi.fn(),
  upgradeKeys: vi.fn(),
}));

vi.mock('@send-backend/ws/login', () => ({
  loginEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

vi.mock('@send-backend/ws/verify', () => ({
  verificationEmitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

const USER = 'user-v2';
const enc = { iv: 'AAAAAAAAAAAAAAAA', ct: 'Y2lwaGVydGV4dA==' };
const envelope = {
  v: 2,
  kdf: {
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations: 100000,
    salt: 'c2FsdHNhbHRzYWx0c2FsdA==',
  },
  wrappedBackupKey: 'd3JhcHBlZA==',
  items: {
    publicKey: enc,
    privateKey: enc,
    containerKeys: { 'c-1': enc },
  },
};

const input = {
  publicKey: 'new-public-key-jwk',
  backup: JSON.stringify(envelope),
  backupVersion: 2 as const,
  trigger: 'optin' as const,
};

const baseCtx = {
  res: { setHeader: vi.fn() },
  authorization: null,
  cookies: { jwtToken: 'jwt', jwtRefreshToken: 'refresh' },
  oidcUser: null,
  user: { id: USER },
};

function caller(ctx: object = baseCtx) {
  //@ts-ignore
  return usersRouter.createCaller(ctx);
}

const resetInput = {
  publicKey: 'pk',
  backupKeypair: 'kp',
  backupKeystring: 'ks',
  backupSalt: 'salt',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(oidc.extractBearerToken).mockReturnValue(null);
  vi.mocked(jwt.validateJWT).mockReturnValue('valid');
  vi.mocked(upgradeKeys).mockResolvedValue({
    from: 1,
    items: 0,
    linksRevoked: 0,
  });
  vi.stubEnv('KEY_BACKUP_V2_MODE', 'optin');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('upgradeKeys', () => {
  it('installs the v2 backup and logs one line without key material', async () => {
    const result = await caller().upgradeKeys(input);

    expect(result).toEqual({ backupVersion: 2, linksRevoked: 0 });
    expect(upgradeKeys).toHaveBeenCalledWith(USER, input);
    const logged = vi
      .mocked(console.info)
      .mock.calls.find(([msg]) => msg === 'key backup upgraded');
    expect(JSON.parse(logged[1])).toEqual({
      userId: USER,
      from: 1,
      to: 2,
      trigger: 'optin',
      items: 0,
      linksRevoked: 0,
    });
    expect(logged[1]).not.toContain(input.publicKey);
    expect(logged[1]).not.toContain(envelope.wrappedBackupKey);
  });

  it('passes item re-wraps and link revocation through', async () => {
    vi.mocked(upgradeKeys).mockResolvedValue({
      from: 1,
      items: 1,
      linksRevoked: 3,
    });
    const full = {
      ...input,
      trigger: 'auto' as const,
      containers: [{ id: 'c-1', wrappedKey: 'ignored' }],
      items: [{ id: 7, wrappedKey: 'new', expectedWrappedKey: 'old' }],
      revokeLinks: true,
    };

    await expect(caller().upgradeKeys(full)).resolves.toEqual({
      backupVersion: 2,
      linksRevoked: 3,
    });
    expect(upgradeKeys).toHaveBeenCalledWith(USER, full);
  });

  it('maps a stale or foreign item to 409 CONFLICT', async () => {
    vi.mocked(upgradeKeys).mockRejectedValue(new BaseError(KEY_UPGRADE_STALE));

    await expect(caller().upgradeKeys(input)).rejects.toThrow(
      new TRPCError({ code: 'CONFLICT', message: KEY_UPGRADE_STALE })
    );
  });

  it('maps an unexpected failure to UNPROCESSABLE_CONTENT', async () => {
    vi.mocked(upgradeKeys).mockRejectedValue(new Error('db down'));

    await expect(caller().upgradeKeys(input)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
    });
  });

  it('is refused while KEY_BACKUP_V2_MODE is off', async () => {
    vi.stubEnv('KEY_BACKUP_V2_MODE', 'off');

    await expect(caller().upgradeKeys(input)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(upgradeKeys).not.toHaveBeenCalled();
  });

  it.each([
    ['not JSON', 'not-json'],
    ['a v1 envelope', JSON.stringify({ ...envelope, v: 1 })],
    [
      'an item without an IV',
      JSON.stringify({
        ...envelope,
        items: { ...envelope.items, privateKey: { ct: 'Y3Q=' } },
      }),
    ],
    [
      'missing wrappedBackupKey',
      JSON.stringify({ ...envelope, wrappedBackupKey: undefined }),
    ],
  ])('rejects a backup that is %s', async (_, backup) => {
    await expect(
      caller().upgradeKeys({ ...input, backup })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(upgradeKeys).not.toHaveBeenCalled();
  });

  it('rejects a downgrade request (backupVersion 1)', async () => {
    await expect(
      caller().upgradeKeys({ ...input, backupVersion: 1 as never })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(upgradeKeys).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated caller', async () => {
    vi.mocked(jwt.validateJWT).mockReturnValue(null);

    await expect(
      caller({ ...baseCtx, user: null }).upgradeKeys(input)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(upgradeKeys).not.toHaveBeenCalled();
  });
});

describe('resetKeys downgrade guard', () => {
  it('refuses with 409 BACKUP_FORMAT_SUPERSEDED once the user is on v2', async () => {
    vi.mocked(assertLegacyBackupWritable).mockRejectedValue(
      new BaseError(BACKUP_FORMAT_SUPERSEDED)
    );

    await expect(caller().resetKeys(resetInput)).rejects.toThrow(
      new TRPCError({ code: 'CONFLICT', message: BACKUP_FORMAT_SUPERSEDED })
    );
    expect(resetKeys).not.toHaveBeenCalled();
  });

  it('still resets a v1 user', async () => {
    vi.mocked(assertLegacyBackupWritable).mockResolvedValue(undefined);
    vi.mocked(resetKeys).mockResolvedValue({ id: USER } as never);

    await expect(caller().resetKeys(resetInput)).resolves.toEqual({
      success: true,
    });
    expect(assertLegacyBackupWritable).toHaveBeenCalledWith(USER, 'resetKeys');
  });
});

describe('settings.keyBackupV2', () => {
  const settingsInput = { version: '1.0.0', appName: null };

  it('reports mode, availability and the signed-in user version', async () => {
    vi.mocked(getBackupVersion).mockResolvedValue(1);

    const { keyBackupV2 } = await caller().settings(settingsInput);

    expect(keyBackupV2).toEqual({
      mode: 'optin',
      available: true,
      userVersion: 1,
    });
  });

  it('is unavailable with a null version for a signed-out caller in off mode', async () => {
    vi.stubEnv('KEY_BACKUP_V2_MODE', '');

    const { keyBackupV2 } = await caller({
      ...baseCtx,
      user: null,
    }).settings(settingsInput);

    expect(keyBackupV2).toEqual({
      mode: 'off',
      available: false,
      userVersion: null,
    });
    expect(getBackupVersion).not.toHaveBeenCalled();
  });
});
