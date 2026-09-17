import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractBearerToken } from '../../auth/oidc';
import {
  requireServiceAuth,
  type RequestWithServiceCaller,
} from '../../auth/service-auth';

vi.mock('../../auth/oidc', () => ({
  extractBearerToken: vi.fn(),
}));

const KEY_ACCOUNTS = 'a'.repeat(43);
const KEY_ACCOUNTS_PREV = 'b'.repeat(43);

describe('requireServiceAuth', () => {
  const originalKeys = process.env.INTERNAL_API_KEYS;
  let req: Partial<RequestWithServiceCaller>;
  let res: Partial<Response> & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      headers: { authorization: `Bearer ${KEY_ACCOUNTS}` },
      method: 'GET',
      originalUrl: '/api/internal/users/abc/storage',
    };
    res = {
      status: vi.fn(() => res),
      json: vi.fn(() => res),
    } as unknown as typeof res;
    next = vi.fn();

    // Two labeled keys configured by default (current + previous for rotation).
    process.env.INTERNAL_API_KEYS = `accounts:${KEY_ACCOUNTS},accounts-prev:${KEY_ACCOUNTS_PREV}`;

    // Default: the presented Bearer token is the current key.
    vi.mocked(extractBearerToken).mockReturnValue(KEY_ACCOUNTS);
  });

  afterEach(() => {
    if (originalKeys === undefined) {
      delete process.env.INTERNAL_API_KEYS;
    } else {
      process.env.INTERNAL_API_KEYS = originalKeys;
    }
  });

  it('returns 503 when no integration key is configured (fail closed)', () => {
    delete process.env.INTERNAL_API_KEYS;

    requireServiceAuth()(req as Request, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(extractBearerToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 503 when INTERNAL_API_KEYS is set but contains no valid label:key pair', () => {
    // Entries without a colon (no label) are skipped, leaving zero keys.
    process.env.INTERNAL_API_KEYS = 'garbage,also-garbage';

    requireServiceAuth()(req as Request, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when no Bearer token is present', () => {
    vi.mocked(extractBearerToken).mockReturnValue(null);

    requireServiceAuth()(req as Request, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the presented key matches no configured key', () => {
    vi.mocked(extractBearerToken).mockReturnValue('c'.repeat(43));

    requireServiceAuth()(req as Request, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and attaches the caller label for the current key (happy path)', () => {
    requireServiceAuth()(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect((req as RequestWithServiceCaller).serviceCaller).toEqual({
      label: 'accounts',
    });
  });

  it('accepts the previous key during rotation and reports its label', () => {
    vi.mocked(extractBearerToken).mockReturnValue(KEY_ACCOUNTS_PREV);

    requireServiceAuth()(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as RequestWithServiceCaller).serviceCaller).toEqual({
      label: 'accounts-prev',
    });
  });

  it('preserves colons in the key material (only the first colon splits label:key)', () => {
    const keyWithColons = 'x:y:z' + '0'.repeat(40);
    process.env.INTERNAL_API_KEYS = `accounts:${keyWithColons}`;
    vi.mocked(extractBearerToken).mockReturnValue(keyWithColons);

    requireServiceAuth()(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as RequestWithServiceCaller).serviceCaller).toEqual({
      label: 'accounts',
    });
  });

  it('ignores malformed entries but honors valid ones in the same list', () => {
    // A bare entry (no colon) and a label-only entry are skipped; the valid
    // pair still authenticates.
    process.env.INTERNAL_API_KEYS = `nolabel,emptykey:,accounts:${KEY_ACCOUNTS}`;

    requireServiceAuth()(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as RequestWithServiceCaller).serviceCaller).toEqual({
      label: 'accounts',
    });
  });

  it('never logs key material on a rejected request', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(extractBearerToken).mockReturnValue(KEY_ACCOUNTS);
    // Force a mismatch to exercise the rejection path.
    process.env.INTERNAL_API_KEYS = `accounts:${KEY_ACCOUNTS_PREV}`;

    requireServiceAuth()(req as Request, res as unknown as Response, next);

    const logged = [...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .join(' ');
    expect(logged).not.toContain(KEY_ACCOUNTS);
    expect(logged).not.toContain(KEY_ACCOUNTS_PREV);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
