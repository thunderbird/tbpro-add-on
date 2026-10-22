/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  DAYS_TO_EXPIRY,
  JWT_EXPIRY_IN_MILLISECONDS,
  JWT_EXPIRY_IN_SECONDS,
  JWT_REFRESH_TOKEN_EXPIRY_IN_DAYS,
  JWT_REFRESH_TOKEN_EXPIRY_IN_SECONDS,
} from '@send-backend/config';
import {
  convertDaysToMilliseconds,
  convertMillisecondsToMinutes,
} from '@send-backend/utils';
import { after, before } from 'node:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  clearCookie,
  getAllowedOrigins,
  getDataFromAuthenticatedRequest,
  getStorageLimit,
  getUserFromJWT,
  registerAuthToken,
  registerTokens,
} from '../../auth/client';

const { mockedVerify, mockedSign } = vi.hoisted(() => ({
  mockedVerify: vi.fn(),
  mockedSign: vi.fn(),
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: mockedVerify, sign: mockedSign },
}));

describe('getAllowedOrigins', () => {
  let originalEnv;

  // Back up the environment before we mess with it
  before(() => {
    originalEnv = process.env;
  });

  // Test various environment variable inputs
  it('should throw an error when no environment variable is provided', async () => {
    delete process.env.SEND_BACKEND_CORS_ORIGINS;
    expect(() => getAllowedOrigins()).toThrowError(
      'Environment variable SEND_BACKEND_CORS_ORIGINS must be set'
    );
  });

  it('should throw an error when an empty origin is provided', async () => {
    process.env.SEND_BACKEND_CORS_ORIGINS = '';
    expect(() => getAllowedOrigins()).toThrowError(
      'Environment variable SEND_BACKEND_CORS_ORIGINS must be set'
    );
  });

  it('should return an array with the correct single item when a single valid origin is provided', async () => {
    process.env.SEND_BACKEND_CORS_ORIGINS = 'http://localhost:12345';
    const origins = await getAllowedOrigins();
    expect(origins).toEqual(['http://localhost:12345']);
  });

  it('should return the correct array when multiple valid origins are provided', async () => {
    process.env.SEND_BACKEND_CORS_ORIGINS =
      'http://localhost:12345,http://thebestsite.edu';
    const origins = await getAllowedOrigins();
    expect(origins).toEqual([
      'http://localhost:12345',
      'http://thebestsite.edu',
    ]);
  });

  it('should handle spaces between origin strings', async () => {
    process.env.SEND_BACKEND_CORS_ORIGINS =
      'http://localhost:12345, http://thebestsite.edu, https://spaceforeand.aft ,';
    const origins = await getAllowedOrigins();
    expect(origins).toEqual([
      'http://localhost:12345',
      'http://thebestsite.edu',
      'https://spaceforeand.aft',
    ]);
  });

  // Restore the original environment
  after(() => {
    process.env = originalEnv;
  });
});

describe('getUserFromJWT', () => {
  beforeAll(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'your_secret');
  });

  it('should return the user from a token verified with the access secret', () => {
    const mockedTokenData = { userId: '123' };
    mockedVerify.mockReturnValue(mockedTokenData);

    const data = getUserFromJWT('valid.token.here');
    expect(data).toStrictEqual(mockedTokenData);
    expect(mockedVerify).toHaveBeenCalledWith(
      'valid.token.here',
      'your_secret',
      { maxAge: JWT_EXPIRY_IN_SECONDS }
    );
  });

  it('should verify a refresh token against the refresh secret and lifetime', () => {
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh_secret');
    mockedVerify.mockReturnValue({ userId: '123' });

    getUserFromJWT('refresh.token.here', 'refresh');
    expect(mockedVerify).toHaveBeenCalledWith(
      'refresh.token.here',
      'refresh_secret',
      { maxAge: JWT_REFRESH_TOKEN_EXPIRY_IN_SECONDS }
    );
  });

  it('should throw if the token fails verification', () => {
    mockedVerify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    expect(() => getUserFromJWT('forged.token')).toThrowError(
      'invalid signature'
    );
  });

  describe('getDataFromAuthenticatedRequest', () => {
    beforeAll(() => {
      vi.unstubAllEnvs();
      vi.stubEnv('ACCESS_TOKEN_SECRET', 'your_secret');
    });

    it('should return the user from the authenticated request', () => {
      const mockedTokenData = { userId: '123' };
      mockedVerify.mockReturnValue(mockedTokenData);

      const req = {
        headers: {
          cookie: 'authorization=Bearer%20valid.token.here',
        },
      };
      //@ts-ignore
      const user = getDataFromAuthenticatedRequest(req as Request);
      expect(user).toStrictEqual(mockedTokenData);
    });

    it('should return null if authorization header is missing', () => {
      const req = {
        headers: {
          authorization: null,
        },
      };

      expect(() => {
        //@ts-ignore
        getDataFromAuthenticatedRequest(req as Request);
      }).toThrowError(
        'No token found in request: This should not happen if the user is authenticated'
      );
    });

    it('should throw if the cookie token fails verification', () => {
      mockedVerify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      const req = {
        headers: {
          cookie: 'authorization=Bearer%20forged.token',
        },
      };

      expect(() => {
        // @ts-ignore
        getDataFromAuthenticatedRequest(req as Request);
      }).toThrowError('invalid signature');
    });

    it('should return null if token format is incorrect', () => {
      const req = {
        headers: {
          authorization: 'InvalidTokenFormat',
        },
      };

      expect(() => {
        // @ts-ignore
        getDataFromAuthenticatedRequest(req as Request);
      }).toThrowError(
        'No token found in request: This should not happen if the user is authenticated'
      );
    });
  });
});

describe('registerAuthToken', () => {
  beforeAll(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'test_secret');
  });

  it('should set cookie with correct parameters', () => {
    const mockRes = {
      cookie: vi.fn(),
    };
    const mockSignedData = {
      tier: 'PRO',
      email: 'test@example.com',
    };

    //@ts-ignore
    registerAuthToken(mockSignedData as any, mockRes);

    expect(mockRes.cookie).toHaveBeenCalledWith(
      'authorization',
      expect.stringContaining('Bearer '),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        maxAge: expect.any(Number),
      })
    );
  });
});

describe('clearCookie', async () => {
  it('should clear the cookie', async () => {
    const mockRes = {
      cookie: vi.fn(),
    };
    clearCookie('cookie_name', mockRes as any);
    expect(mockRes.cookie).toHaveBeenCalledWith(
      'cookie_name',
      'null',
      expect.objectContaining({
        maxAge: 0,
        httpOnly: true,
        sameSite: 'none',
        secure: true,
      })
    );
  });
});

describe('registerTokens', () => {
  beforeAll(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'test_secret');
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh_secret');
    vi.resetAllMocks();
  });

  it('should set both auth and refresh cookies with correct parameters', () => {
    const mockRes = {
      cookie: vi.fn(),
    };
    const mockSignedData = {
      id: 1,
      uniqueHash: 'hash-1',
      tier: 'PRO',
      email: 'test@example.com',
    };

    mockedSign.mockReturnValueOnce('mocked_refresh_token');
    mockedSign.mockReturnValueOnce('mocked_auth_token');

    //@ts-ignore
    registerTokens(mockSignedData as any, mockRes);

    // Check that JWT expirations are set correctly
    expect(
      convertDaysToMilliseconds(JWT_REFRESH_TOKEN_EXPIRY_IN_DAYS).stringified
    ).toBe('7d');
    expect(
      convertMillisecondsToMinutes(JWT_EXPIRY_IN_MILLISECONDS).stringified
    ).toBe('60m');
    expect(JWT_REFRESH_TOKEN_EXPIRY_IN_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(JWT_EXPIRY_IN_SECONDS).toBe(60 * 60);

    expect(mockRes.cookie).toHaveBeenCalledTimes(2);
    expect(mockRes.cookie).toHaveBeenNthCalledWith(
      1,
      'refresh_token',
      'Bearer mocked_refresh_token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        maxAge: convertDaysToMilliseconds(JWT_REFRESH_TOKEN_EXPIRY_IN_DAYS)
          .milliseconds,
      })
    );
    expect(mockRes.cookie).toHaveBeenNthCalledWith(
      2,
      'authorization',
      'Bearer mocked_auth_token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        maxAge: JWT_EXPIRY_IN_MILLISECONDS,
      })
    );
    expect(mockedSign).toHaveBeenCalledTimes(2);

    // The lifetime is handed to the library as `expiresIn` (seconds); the
    // payload itself carries no `exp`, so the library sets it in the unit
    // verify() reads.
    expect(mockedSign).toHaveBeenNthCalledWith(
      1,
      mockSignedData,
      'refresh_secret',
      {
        expiresIn: JWT_REFRESH_TOKEN_EXPIRY_IN_SECONDS,
      }
    );
    expect(mockedSign).toHaveBeenNthCalledWith(
      2,
      mockSignedData,
      'test_secret',
      {
        expiresIn: JWT_EXPIRY_IN_SECONDS,
      }
    );
  });

  it('signs only the session fields, dropping extra columns and old time claims', () => {
    mockedSign.mockClear();
    const mockRes = { cookie: vi.fn() };
    const fromVerifiedRefreshToken = {
      id: 1,
      uniqueHash: 'hash-1',
      tier: 'PRO',
      email: 'test@example.com',
      name: 'Test',
      exp: 1,
      iat: 1,
    };

    //@ts-ignore
    registerTokens(fromVerifiedRefreshToken as any, mockRes);

    const expectedPayload = {
      id: 1,
      uniqueHash: 'hash-1',
      tier: 'PRO',
      email: 'test@example.com',
    };
    expect(mockedSign).toHaveBeenNthCalledWith(
      1,
      expectedPayload,
      'refresh_secret',
      expect.anything()
    );
    expect(mockedSign).toHaveBeenNthCalledWith(
      2,
      expectedPayload,
      'test_secret',
      expect.anything()
    );
  });
});

describe('getStorageLimit', () => {
  beforeAll(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'your_secret');
  });

  it('should return hasLimitedStorage false for non-EPHEMERAL tier', () => {
    const mockedTokenData = { tier: 'PRO' };
    mockedVerify.mockReturnValue(mockedTokenData);

    const req = {
      headers: {
        cookie: 'authorization=Bearer%20valid.token.here',
      },
    };

    // @ts-ignore
    const result = getStorageLimit(req as Request);
    expect(result).toEqual({
      hasLimitedStorage: false,
      daysToExpiry: DAYS_TO_EXPIRY,
    });
  });

  it('should return hasLimitedStorage true for EPHEMERAL tier', () => {
    const mockedTokenData = { tier: 'EPHEMERAL' };
    mockedVerify.mockReturnValue(mockedTokenData);

    const req = {
      headers: {
        cookie: 'authorization=Bearer%20valid.token.here',
      },
    };

    // @ts-ignore
    const result = getStorageLimit(req as Request);
    expect(result).toEqual({
      hasLimitedStorage: true,
      daysToExpiry: DAYS_TO_EXPIRY,
    });
  });

  it('should throw error when no authorization is present', () => {
    const req = {
      headers: {
        cookie: '',
      },
    };

    expect(() => {
      //@ts-ignore
      getStorageLimit(req as Request);
    }).toThrowError(
      'No token found in request: This should not happen if the user is authenticated'
    );
  });
});
