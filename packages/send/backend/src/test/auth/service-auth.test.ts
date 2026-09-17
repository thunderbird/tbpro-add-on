import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractBearerToken, introspectToken } from '../../auth/oidc';
import {
  requireServiceAuth,
  type RequestWithServiceCaller,
} from '../../auth/service-auth';

vi.mock('../../auth/oidc', () => ({
  extractBearerToken: vi.fn(),
  introspectToken: vi.fn(),
}));

describe('requireServiceAuth', () => {
  let req: Partial<RequestWithServiceCaller>;
  let res: Partial<Response> & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      headers: { authorization: 'Bearer token' },
      method: 'GET',
      originalUrl: '/api/internal/users/abc/storage',
    };
    res = {
      status: vi.fn(() => res),
      json: vi.fn(() => res),
    } as unknown as typeof res;
    next = vi.fn();

    // Introspection is configured by default; individual tests override.
    process.env.OIDC_TOKEN_INTROSPECTION_URL = 'https://kc/introspect';
    process.env.OIDC_CLIENT_ID = 'send-backend';
    process.env.OIDC_CLIENT_SECRET = 'secret';
    process.env.INTERNAL_ALLOWED_CLIENT_IDS = 'accounts-backend';

    // Default: a valid Bearer token is present.
    vi.mocked(extractBearerToken).mockReturnValue('token');
  });

  it('returns 401 when no Bearer token is present', async () => {
    vi.mocked(extractBearerToken).mockReturnValue(null);

    await requireServiceAuth()(
      req as Request,
      res as unknown as Response,
      next
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(introspectToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is not active', async () => {
    vi.mocked(introspectToken).mockResolvedValue({ active: false });

    await requireServiceAuth()(
      req as Request,
      res as unknown as Response,
      next
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the token is active but its client is not allowlisted', async () => {
    vi.mocked(introspectToken).mockResolvedValue({
      active: true,
      client_id: 'some-other-client',
    });

    await requireServiceAuth()(
      req as Request,
      res as unknown as Response,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for every caller when the allowlist is empty', async () => {
    process.env.INTERNAL_ALLOWED_CLIENT_IDS = '';
    vi.mocked(introspectToken).mockResolvedValue({
      active: true,
      client_id: 'accounts-backend',
    });

    await requireServiceAuth()(
      req as Request,
      res as unknown as Response,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 503 when introspection is not configured (fail closed)', async () => {
    delete process.env.OIDC_TOKEN_INTROSPECTION_URL;

    await requireServiceAuth()(
      req as Request,
      res as unknown as Response,
      next
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(introspectToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 503 when the introspection call throws (outage, fail closed)', async () => {
    vi.mocked(introspectToken).mockRejectedValue(new Error('kc down'));

    await requireServiceAuth()(
      req as Request,
      res as unknown as Response,
      next
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and attaches the caller for an active, allowlisted client (happy path)', async () => {
    vi.mocked(introspectToken).mockResolvedValue({
      active: true,
      client_id: 'accounts-backend',
    });

    await requireServiceAuth()(
      req as Request,
      res as unknown as Response,
      next
    );

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect((req as RequestWithServiceCaller).serviceCaller).toEqual({
      clientId: 'accounts-backend',
    });
  });

  it('falls back to azp when client_id is absent', async () => {
    vi.mocked(introspectToken).mockResolvedValue({
      active: true,
      azp: 'accounts-backend',
    });

    await requireServiceAuth()(
      req as Request,
      res as unknown as Response,
      next
    );

    expect(next).toHaveBeenCalledOnce();
    expect((req as RequestWithServiceCaller).serviceCaller).toEqual({
      clientId: 'accounts-backend',
    });
  });

  it('enforces requiredScope when provided (403 on missing scope)', async () => {
    vi.mocked(introspectToken).mockResolvedValue({
      active: true,
      client_id: 'accounts-backend',
      scope: 'openid profile',
    });

    await requireServiceAuth('storage:read')(
      req as Request,
      res as unknown as Response,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes when requiredScope is present', async () => {
    vi.mocked(introspectToken).mockResolvedValue({
      active: true,
      client_id: 'accounts-backend',
      scope: 'openid storage:read',
    });

    await requireServiceAuth('storage:read')(
      req as Request,
      res as unknown as Response,
      next
    );

    expect(next).toHaveBeenCalledOnce();
  });
});
