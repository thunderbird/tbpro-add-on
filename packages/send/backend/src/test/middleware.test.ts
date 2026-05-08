import { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDataFromAuthenticatedRequest } from '../auth/client';
import { extractBearerToken, validateOIDCToken } from '../auth/oidc';
import { validateJWT } from '../auth/jwt';
import {
  addVersionHeader,
  checkStorageLimit,
  getGroupMemberPermissions,
  renameBodyProperty,
  requireAdminPermission,
  requireAdminPermisions,
  requireJWT,
  requireAuth,
  requirePublicLogin,
  requireReadPermission,
  requireSharePermission,
  requireWritePermission,
} from '../middleware';
import { getUsedStorage } from '../models';
import { fromPrismaV2 } from '../models/prisma-helper';
import { getAdminStatus, getUserByOIDCSubject } from '../models/users';
import {
  allPermissions,
  hasAdmin,
  hasRead,
  hasShare,
  hasWrite,
  PermissionType,
} from '../types/custom';
import { getStorageLimitForTier } from '../utils/storageLimits';

const { mockedVerify } = vi.hoisted(() => ({
  mockedVerify: vi.fn(),
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: mockedVerify },
}));

vi.mock('../auth/client', () => ({
  getDataFromAuthenticatedRequest: vi.fn(),
}));

vi.mock('../models/prisma-helper', () => ({
  fromPrismaV2: vi.fn(),
}));

vi.mock('../auth/jwt', () => ({
  validateJWT: vi.fn(),
}));

vi.mock('../types/custom', () => ({
  allPermissions: vi.fn(),
  hasRead: vi.fn(),
  hasWrite: vi.fn(),
  hasAdmin: vi.fn(),
  hasShare: vi.fn(),
  PermissionType: {
    READ: 2,
    WRITE: 4,
    SHARE: 8,
    ADMIN: 16,
  },
}));

vi.mock('../auth/oidc', () => ({
  extractBearerToken: vi.fn(),
  validateOIDCToken: vi.fn(),
}));

vi.mock('../models/users', () => ({
  getUserByOIDCSubject: vi.fn(),
  getAdminStatus: vi.fn(),
}));

vi.mock('../models', () => ({
  getUsedStorage: vi.fn(),
}));

vi.mock('../utils/storageLimits', () => ({
  getStorageLimitForTier: vi.fn(),
}));

describe('requireJWT', () => {
  let mockRequest: Partial<Request>;
  let mockResponse;
  const nextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { headers: { cookie: '' } };
    mockResponse = {
      json: vi.fn(),
      status: vi.fn(() => mockResponse),
    };
    process.env.ACCESS_TOKEN_SECRET = 'your_secret_key';
  });

  it('should call next() for a valid token', async () => {
    const token = 'valid.token.here';
    mockRequest.headers.cookie = `authorization=Bearer%20${token}`;

    vi.mocked(validateJWT).mockReturnValue('valid');

    await requireJWT(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(validateJWT).toHaveBeenCalled();
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should reject with a status 403 if both token and refresh token are empty', async () => {
    mockRequest.headers.cookie = '';

    vi.mocked(validateJWT).mockReturnValue(null);

    await requireJWT(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({
      message: 'Not authorized: Token not found',
    });
  });

  it('should reject with a status 401 if the token is invalid', async () => {
    const token = 'invalid.token';
    const refreshToken = 'valid.refresh';
    mockRequest.headers.cookie = `authorization=Bearer%20${token};refresh_token=Bearer%20${refreshToken}`;

    vi.mocked(validateJWT).mockReturnValue('shouldRefresh');

    await requireJWT(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toBeCalledWith({
      message: `Not authorized: Token expired`,
    });
  });

  it('should reject with a status 403 if refresh token is invalid', async () => {
    const token = 'invalid.token';
    const refreshToken = 'valid.refresh';
    mockRequest.headers.cookie = `authorization=Bearer%20${token};refresh_token=Bearer%20${refreshToken}`;

    vi.mocked(validateJWT).mockReturnValue('shouldLogin');

    await requireJWT(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toBeCalledWith({
      message: `Not authorized: Refresh token expired`,
    });
  });
});

describe('getGroupMemberPermissions', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Response;
  const nextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = {
      headers: { cookie: '' },
      params: {},
      body: {},
    };
    mockResponse = {
      json: vi.fn(),
      status: vi.fn(() => mockResponse),
    } as unknown as Response;
    vi.mocked(validateJWT).mockReturnValue('valid');
    vi.mocked(allPermissions).mockReturnValue(
      PermissionType.READ |
        PermissionType.WRITE |
        PermissionType.SHARE |
        PermissionType.ADMIN
    );
  });

  it('should set all permissions for top-level folder when no containerId is provided', async () => {
    const userId = '123';
    vi.mocked(getDataFromAuthenticatedRequest).mockReturnValue({
      id: userId,
      uniqueHash: 'hash123',
      email: 'test@example.com',
      tier: 'PRO',
    });
    mockRequest.headers.cookie = 'authorization=Bearer valid.token';

    await getGroupMemberPermissions(
      mockRequest as Request,
      mockResponse,
      nextFunction
    );

    expect(mockRequest['_permission']).toBeDefined();
    expect(mockRequest['_permission']).toBe(
      PermissionType.READ |
        PermissionType.WRITE |
        PermissionType.SHARE |
        PermissionType.ADMIN
    );
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should set permissions from group membership when containerId is provided in params', async () => {
    const userId = '123';
    const containerId = '456';
    const groupId = '789';
    const mockPermissions =
      PermissionType.READ | PermissionType.WRITE | PermissionType.SHARE;

    vi.mocked(getDataFromAuthenticatedRequest).mockReturnValue({
      id: userId,
      uniqueHash: 'hash123',
      email: 'test@example.com',
      tier: 'PRO',
    });
    mockRequest.headers.cookie = 'authorization=Bearer valid.token';
    mockRequest.params = { containerId };

    vi.mocked(fromPrismaV2)
      .mockResolvedValueOnce({ id: groupId }) // group.findFirstOrThrow
      .mockResolvedValueOnce({ permission: mockPermissions }); // membership.findUniqueOrThrow

    await getGroupMemberPermissions(
      mockRequest as Request,
      mockResponse,
      nextFunction
    );

    expect(mockRequest['_permission']).toBe(mockPermissions);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should set permissions from group membership when containerId is provided in body', async () => {
    const userId = '123';
    const containerId = '456';
    const groupId = '789';
    const mockPermissions =
      PermissionType.READ | PermissionType.WRITE | PermissionType.SHARE;

    vi.mocked(getDataFromAuthenticatedRequest).mockReturnValue({
      id: userId,
      uniqueHash: 'hash123',
      email: 'test@example.com',
      tier: 'PRO',
    });
    mockRequest.headers.cookie = 'authorization=Bearer valid.token';
    mockRequest.body = { containerId };

    vi.mocked(fromPrismaV2)
      .mockResolvedValueOnce({ id: groupId }) // group.findFirstOrThrow
      .mockResolvedValueOnce({ permission: mockPermissions }); // membership.findUniqueOrThrow

    await getGroupMemberPermissions(
      mockRequest as Request,
      mockResponse,
      nextFunction
    );

    expect(mockRequest['_permission']).toBe(mockPermissions);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should reject with 403 when JWT validation fails', async () => {
    vi.mocked(validateJWT).mockReturnValue(null);

    await getGroupMemberPermissions(
      mockRequest as Request,
      mockResponse,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({
      message: 'Not authorized',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should reject with 403 when user is not authenticated', async () => {
    vi.mocked(getDataFromAuthenticatedRequest).mockImplementation(() => {
      throw new Error('Not authenticated');
    });

    await getGroupMemberPermissions(
      mockRequest as Request,
      mockResponse,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({
      message: 'Not authorized',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should reject with 403 when group is not found', async () => {
    const userId = '123';
    const containerId = '456';

    vi.mocked(getDataFromAuthenticatedRequest).mockReturnValue({
      id: userId,
      uniqueHash: 'hash123',
      email: 'test@example.com',
      tier: 'PRO',
    });
    mockRequest.params = { containerId };

    vi.mocked(fromPrismaV2).mockRejectedValueOnce(new Error('Group not found')); // group.findFirstOrThrow

    await getGroupMemberPermissions(
      mockRequest as Request,
      mockResponse,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({
      message: 'Not authorized',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should reject with 403 when membership is not found', async () => {
    const userId = '123';
    const containerId = '456';
    const groupId = '789';

    vi.mocked(getDataFromAuthenticatedRequest).mockReturnValue({
      id: userId,
      uniqueHash: 'hash123',
      email: 'test@example.com',
      tier: 'PRO',
    });
    mockRequest.params = { containerId };

    vi.mocked(fromPrismaV2)
      .mockResolvedValueOnce({ id: groupId }) // group.findFirstOrThrow
      .mockRejectedValueOnce(new Error('Membership not found')); // membership.findUniqueOrThrow

    await getGroupMemberPermissions(
      mockRequest as Request,
      mockResponse,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({
      message: 'Not authorized',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

describe('requireAuth', () => {
  let mockRequest: Partial<Request> & {
    oidcUser?: unknown;
    authenticatedUser?: unknown;
  };
  let mockResponse;
  const nextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { headers: {} };
    mockResponse = {
      json: vi.fn(),
      status: vi.fn(() => mockResponse),
    };
  });

  it('should call next() and set oidcUser for a valid OIDC token', async () => {
    vi.mocked(extractBearerToken).mockReturnValue('valid.oidc.token');
    vi.mocked(validateOIDCToken).mockResolvedValue({
      isValid: true,
      userInfo: { sub: 'oidc-sub-1', email: 'oidc@test.com' },
    });
    vi.mocked(getUserByOIDCSubject).mockResolvedValue({
      id: 'user-1',
      email: 'oidc@test.com',
      uniqueHash: 'hash1',
      tier: 'PRO',
    } as any);

    await requireAuth(mockRequest as Request, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(mockRequest.oidcUser).toEqual({
      sub: 'oidc-sub-1',
      email: 'oidc@test.com',
    });
    expect(mockRequest.authenticatedUser).toMatchObject({ id: 'user-1' });
  });

  it('should call next() with oidcUser only when user not found in DB', async () => {
    vi.mocked(extractBearerToken).mockReturnValue('valid.oidc.token');
    vi.mocked(validateOIDCToken).mockResolvedValue({
      isValid: true,
      userInfo: { sub: 'oidc-sub-2' },
    });
    vi.mocked(getUserByOIDCSubject).mockRejectedValue(new Error('not found'));

    await requireAuth(mockRequest as Request, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(mockRequest.oidcUser).toEqual({ sub: 'oidc-sub-2' });
  });

  it('should fall back to JWT when OIDC validation fails', async () => {
    vi.mocked(extractBearerToken).mockReturnValue('bad.oidc.token');
    vi.mocked(validateOIDCToken).mockRejectedValue(new Error('invalid'));
    mockRequest.headers = { cookie: 'authorization=Bearer%20valid.jwt' };
    vi.mocked(validateJWT).mockReturnValue('valid');
    vi.mocked(getDataFromAuthenticatedRequest).mockReturnValue({
      id: 'jwt-user',
      email: 'jwt@test.com',
      uniqueHash: 'hash2',
      tier: 'FREE',
    });

    await requireAuth(mockRequest as Request, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
  });

  it('should return 403 when no authentication is present', async () => {
    vi.mocked(extractBearerToken).mockReturnValue(null);
    vi.mocked(validateJWT).mockReturnValue(null);

    await requireAuth(mockRequest as Request, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 when JWT needs refresh', async () => {
    vi.mocked(extractBearerToken).mockReturnValue(null);
    vi.mocked(validateJWT).mockReturnValue('shouldRefresh');

    await requireAuth(mockRequest as Request, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      message: 'Not authorized: Token expired',
    });
  });

  it('should return 403 when JWT refresh token is expired', async () => {
    vi.mocked(extractBearerToken).mockReturnValue(null);
    vi.mocked(validateJWT).mockReturnValue('shouldLogin');

    await requireAuth(mockRequest as Request, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({
      message: 'Not authorized: Refresh token expired',
    });
  });
});

// ---------------------------------------------------------------------------
// requireAdminPermisions
// ---------------------------------------------------------------------------

describe('requireAdminPermisions', () => {
  let mockRequest: Partial<Request>;
  let mockResponse;
  const nextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { headers: { cookie: '' } };
    mockResponse = {
      json: vi.fn(),
      status: vi.fn(() => mockResponse),
    };
  });

  it('should call next() when user is an admin', async () => {
    vi.mocked(getDataFromAuthenticatedRequest).mockReturnValue({
      id: 'admin-1',
      email: 'admin@test.com',
      uniqueHash: 'hash',
      tier: 'PRO',
    });
    vi.mocked(getAdminStatus).mockResolvedValue(true);

    await requireAdminPermisions(
      mockRequest as Request,
      mockResponse,
      nextFunction
    );

    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should return 403 when user is not an admin', async () => {
    vi.mocked(getDataFromAuthenticatedRequest).mockReturnValue({
      id: 'user-2',
      email: 'user@test.com',
      uniqueHash: 'hash',
      tier: 'FREE',
    });
    vi.mocked(getAdminStatus).mockResolvedValue(false);

    await requireAdminPermisions(
      mockRequest as Request,
      mockResponse,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(nextFunction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// checkStorageLimit
// ---------------------------------------------------------------------------

describe('checkStorageLimit', () => {
  let mockRequest: Partial<Request>;
  let mockResponse;
  const nextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { headers: { cookie: '' }, body: {} };
    mockResponse = {
      json: vi.fn(),
      status: vi.fn(() => mockResponse),
    };
    vi.mocked(getDataFromAuthenticatedRequest).mockReturnValue({
      id: 'user-1',
      email: 'user@test.com',
      uniqueHash: 'hash',
      tier: 'PRO',
    });
  });

  it('should call next() when storage is under the limit', async () => {
    mockRequest.body = { size: 100 };
    vi.mocked(getStorageLimitForTier).mockReturnValue(1000);
    vi.mocked(getUsedStorage).mockResolvedValue({
      active: 500,
      total: 500,
    } as any);

    await checkStorageLimit(mockRequest as Request, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should return 403 when storage limit is exceeded', async () => {
    mockRequest.body = { size: 200 };
    vi.mocked(getStorageLimitForTier).mockReturnValue(1000);
    vi.mocked(getUsedStorage).mockResolvedValue({
      active: 900,
      total: 900,
    } as any);

    await checkStorageLimit(mockRequest as Request, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({
      message:
        'Storage limit exceeded. Please remove files to continue uploading.',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should treat missing size as 0', async () => {
    mockRequest.body = {};
    vi.mocked(getStorageLimitForTier).mockReturnValue(1000);
    vi.mocked(getUsedStorage).mockResolvedValue({
      active: 100,
      total: 100,
    } as any);

    await checkStorageLimit(mockRequest as Request, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// requirePublicLogin
// ---------------------------------------------------------------------------

describe('requirePublicLogin', () => {
  let mockRequest: Partial<Request>;
  let mockResponse;
  const nextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = { headers: {} };
    mockResponse = {
      json: vi.fn(),
      status: vi.fn(() => mockResponse),
    };
    delete process.env.ALLOW_PUBLIC_LOGIN;
  });

  it('should call next() when ALLOW_PUBLIC_LOGIN is true', () => {
    process.env.ALLOW_PUBLIC_LOGIN = 'true';

    requirePublicLogin(mockRequest as Request, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should return 500 when ALLOW_PUBLIC_LOGIN is not set', () => {
    requirePublicLogin(mockRequest as Request, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      message: 'Public login is disabled',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 500 when ALLOW_PUBLIC_LOGIN is false', () => {
    process.env.ALLOW_PUBLIC_LOGIN = 'false';

    requirePublicLogin(mockRequest as Request, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(nextFunction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Permission middlewares
// ---------------------------------------------------------------------------

describe('requireReadPermission', () => {
  let mockRequest;
  let mockResponse;
  const nextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = {};
    mockResponse = {
      json: vi.fn(),
      status: vi.fn(() => mockResponse),
    };
  });

  it('should call next() when user has read permission', () => {
    vi.mocked(hasRead).mockReturnValue(PermissionType.READ);

    requireReadPermission(mockRequest, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('should reject with 403 when user lacks read permission', () => {
    vi.mocked(hasRead).mockReturnValue(0);

    requireReadPermission(mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(nextFunction).not.toHaveBeenCalled();
  });
});

describe('requireWritePermission', () => {
  let mockRequest;
  let mockResponse;
  const nextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = {};
    mockResponse = {
      json: vi.fn(),
      status: vi.fn(() => mockResponse),
    };
  });

  it('should call next() when user has write permission', () => {
    vi.mocked(hasWrite).mockReturnValue(PermissionType.WRITE);

    requireWritePermission(mockRequest, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
  });

  it('should reject with 403 when user lacks write permission', () => {
    vi.mocked(hasWrite).mockReturnValue(0);

    requireWritePermission(mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(nextFunction).not.toHaveBeenCalled();
  });
});

describe('requireAdminPermission', () => {
  let mockRequest;
  let mockResponse;
  const nextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = {};
    mockResponse = {
      json: vi.fn(),
      status: vi.fn(() => mockResponse),
    };
  });

  it('should call next() when user has admin permission', () => {
    vi.mocked(hasAdmin).mockReturnValue(PermissionType.ADMIN);

    requireAdminPermission(mockRequest, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
  });

  it('should reject with 403 when user lacks admin permission', () => {
    vi.mocked(hasAdmin).mockReturnValue(0);

    requireAdminPermission(mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(nextFunction).not.toHaveBeenCalled();
  });
});

describe('requireSharePermission', () => {
  let mockRequest;
  let mockResponse;
  const nextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = {};
    mockResponse = {
      json: vi.fn(),
      status: vi.fn(() => mockResponse),
    };
  });

  it('should call next() when user has share permission', () => {
    vi.mocked(hasShare).mockReturnValue(PermissionType.SHARE);

    requireSharePermission(mockRequest, mockResponse, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
  });

  it('should reject with 403 when user lacks share permission', () => {
    vi.mocked(hasShare).mockReturnValue(0);

    requireSharePermission(mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(nextFunction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// renameBodyProperty
// ---------------------------------------------------------------------------

describe('renameBodyProperty', () => {
  const nextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should rename the property and call next()', () => {
    const mockRequest = { body: { oldName: 'value' } } as any;
    const mockResponse = {} as any;
    const middleware = renameBodyProperty('oldName', 'newName');

    middleware(mockRequest, mockResponse, nextFunction);

    expect(mockRequest.body.newName).toBe('value');
    expect(mockRequest.body.oldName).toBeUndefined();
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should not modify body when the source property does not exist', () => {
    const mockRequest = { body: { other: 'value' } } as any;
    const mockResponse = {} as any;
    const middleware = renameBodyProperty('missing', 'newName');

    middleware(mockRequest, mockResponse, nextFunction);

    expect(mockRequest.body.newName).toBeUndefined();
    expect(mockRequest.body.other).toBe('value');
    expect(nextFunction).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// addVersionHeader
// ---------------------------------------------------------------------------

describe('addVersionHeader', () => {
  it('should set the x-tbsend header and call next()', () => {
    const nextFunction = vi.fn();
    const mockRequest = {} as Request;
    const mockResponse = {
      setHeader: vi.fn(),
    } as unknown as Response;

    addVersionHeader(mockRequest, mockResponse, nextFunction);

    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'x-tbsend',
      expect.any(String)
    );
    expect(nextFunction).toHaveBeenCalled();
  });
});
