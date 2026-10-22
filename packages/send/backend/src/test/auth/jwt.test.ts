import { getJWTfromToken, verifyCookieToken } from '@send-backend/auth/client';
import { validateJWT } from '@send-backend/auth/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@send-backend/auth/client', () => ({
  getJWTfromToken: vi.fn(),
  verifyCookieToken: vi.fn(),
}));

describe('validateJWT', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return null when no tokens are present', () => {
    vi.mocked(getJWTfromToken).mockReturnValue('');

    const result = validateJWT({
      jwtToken: '',
      jwtRefreshToken: '',
    });

    expect(result).toBeNull();
    expect(verifyCookieToken).not.toHaveBeenCalled();
  });

  it('should return valid when both tokens verify against their own lifetime', () => {
    vi.mocked(getJWTfromToken)
      .mockReturnValueOnce('valid-token')
      .mockReturnValueOnce('refresh-token');
    vi.mocked(verifyCookieToken).mockReturnValue({} as never);

    const result = validateJWT({
      jwtToken: 'valid-token',
      jwtRefreshToken: 'refresh-token',
    });

    expect(result).toBe('valid');
    expect(verifyCookieToken).toHaveBeenNthCalledWith(
      1,
      'refresh-token',
      'refresh'
    );
    expect(verifyCookieToken).toHaveBeenNthCalledWith(
      2,
      'valid-token',
      'access'
    );
  });

  it('should return shouldRefresh when only the access token fails to verify', () => {
    vi.mocked(getJWTfromToken).mockReturnValue('valid-token');
    vi.mocked(verifyCookieToken)
      .mockImplementationOnce(() => ({}) as never) // refresh token verifies
      .mockImplementationOnce(() => {
        throw new Error('Token invalid');
      }); // access token throws

    const result = validateJWT({
      jwtToken: 'invalid-token',
      jwtRefreshToken: 'refresh-token',
    });

    expect(result).toBe('shouldRefresh');
  });

  it('should return shouldLogin when the refresh token is not valid', () => {
    vi.mocked(getJWTfromToken).mockReturnValue('invalid-refresh-token');
    vi.mocked(verifyCookieToken).mockImplementation(() => {
      throw new Error('Token invalid');
    });

    const result = validateJWT({
      jwtToken: 'valid-token',
      jwtRefreshToken: 'invalid-refresh-token',
    });

    expect(result).toBe('shouldLogin');
  });
});
