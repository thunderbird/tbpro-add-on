import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { introspectToken } from '../../auth/oidc';
import { requireServiceAuth } from '../../auth/service-auth';

// Only introspection is mocked. Bearer-header parsing is pure, so the
// token-presence branches are driven by real Authorization headers instead.
vi.mock('../../auth/oidc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auth/oidc')>()),
  introspectToken: vi.fn(),
}));

describe('requireServiceAuth', () => {
  let req: Partial<Request>;
  let res: Partial<Response> & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      headers: { authorization: 'Bearer token' },
      method: 'GET',
      params: { sub: 'abc' },
    };
    res = {
      status: vi.fn(() => res),
      json: vi.fn(() => res),
      // The middleware registers a `finish` listener; audit emission itself is
      // asserted against a real response in the suite below.
      on: vi.fn(() => res),
    } as unknown as typeof res;
    next = vi.fn();

    // Introspection is configured by default; individual tests override.
    process.env.OIDC_TOKEN_INTROSPECTION_URL = 'https://kc/introspect';
    process.env.OIDC_CLIENT_ID = 'send-backend';
    process.env.OIDC_CLIENT_SECRET = 'secret';
    process.env.INTERNAL_ALLOWED_CLIENT_IDS = 'accounts-backend';
  });

  it('returns 401 when no Bearer token is present', async () => {
    req.headers = {};

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

  it('calls next for an active, allowlisted client (happy path)', async () => {
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
    expect(res.status).not.toHaveBeenCalled();
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

/**
 * The audit line is emitted from the response's `finish` event, so it is only
 * observable against a real response — hence supertest and a real router here,
 * rather than the request/response doubles used above. Mounting at
 * `/api/internal` also exercises the route label the middleware derives.
 */
describe('requireServiceAuth audit logging', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  const buildApp = (
    opts: {
      scope?: string;
      handler?: RequestHandler;
    } = {}
  ) => {
    const router = express.Router();
    router.get(
      '/users/:sub/storage',
      requireServiceAuth(opts.scope),
      opts.handler ?? ((_req, res) => res.status(200).json({ ok: true }))
    );
    const app = express();
    app.use('/api/internal', router);
    return app;
  };

  /** Every `internal_request` line emitted so far, parsed. */
  const auditLines = () =>
    [...infoSpy.mock.calls, ...warnSpy.mock.calls]
      .map((call) => call[0])
      .filter(
        (line): line is string =>
          typeof line === 'string' && line.includes('"internal_request"')
      )
      .map((line) => JSON.parse(line));

  /** Issue a request and let the `finish` listener run before asserting. */
  const call = async (app: express.Application, token?: string) => {
    const req = request(app).get('/api/internal/users/abc/storage');
    if (token) req.set('Authorization', `Bearer ${token}`);
    await req;
    await new Promise((resolve) => setImmediate(resolve));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OIDC_TOKEN_INTROSPECTION_URL = 'https://kc/introspect';
    process.env.OIDC_CLIENT_ID = 'send-backend';
    process.env.OIDC_CLIENT_SECRET = 'secret';
    process.env.INTERNAL_ALLOWED_CLIENT_IDS = 'accounts-backend';

    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Config/outage detail is logged here and asserted only where it matters.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits one line naming the caller, subject and derived route on success', async () => {
    vi.mocked(introspectToken).mockResolvedValue({
      active: true,
      client_id: 'accounts-backend',
    });

    await call(buildApp(), 'token');

    expect(auditLines()).toHaveLength(1);
    expect(auditLines()[0]).toEqual({
      msg: 'internal_request',
      route: 'GET /api/internal/users/:sub/storage',
      clientId: 'accounts-backend',
      sub: 'abc',
      status: 200,
      latencyMs: expect.any(Number),
    });
    // Success is not a warning.
    expect(infoSpy).toHaveBeenCalledOnce();
  });

  it('records the azp-derived client when client_id is absent', async () => {
    vi.mocked(introspectToken).mockResolvedValue({
      active: true,
      azp: 'accounts-backend',
    });

    await call(buildApp(), 'token');

    // The audit line is the only consumer of the resolved client id, so this is
    // where the `azp` fallback's result is observable.
    expect(auditLines()).toMatchObject([
      { clientId: 'accounts-backend', status: 200 },
    ]);
  });

  it('emits a line for a request rejected before any route handler runs', async () => {
    await call(buildApp()); // no Authorization header

    expect(auditLines()).toMatchObject([
      {
        route: 'GET /api/internal/users/:sub/storage',
        sub: 'abc',
        status: 401,
        reason: 'missing_token',
      },
    ]);
    // No client was ever asserted by Keycloak, so none is claimed.
    expect(auditLines()[0]).not.toHaveProperty('clientId');
    // Rejections are warnings, so they stay visible to alerting.
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('emits a line for an inactive token', async () => {
    vi.mocked(introspectToken).mockResolvedValue({ active: false });

    await call(buildApp(), 'token');

    expect(auditLines()).toMatchObject([
      { status: 401, reason: 'invalid_token' },
    ]);
  });

  it('names the denied client when it is not allowlisted', async () => {
    vi.mocked(introspectToken).mockResolvedValue({
      active: true,
      client_id: 'some-other-client',
    });

    await call(buildApp(), 'token');

    expect(auditLines()).toMatchObject([
      {
        clientId: 'some-other-client',
        status: 403,
        reason: 'client_not_allowed',
      },
    ]);
  });

  it('distinguishes an insufficient scope from a disallowed client', async () => {
    vi.mocked(introspectToken).mockResolvedValue({
      active: true,
      client_id: 'accounts-backend',
      scope: 'openid profile',
    });

    await call(buildApp({ scope: 'storage:read' }), 'token');

    expect(auditLines()).toMatchObject([
      {
        clientId: 'accounts-backend',
        status: 403,
        reason: 'insufficient_scope',
      },
    ]);
  });

  it('emits a line when introspection is unconfigured', async () => {
    delete process.env.OIDC_TOKEN_INTROSPECTION_URL;

    await call(buildApp(), 'token');

    expect(auditLines()).toMatchObject([
      { status: 503, reason: 'auth_service_unavailable' },
    ]);
  });

  it('emits a line when introspection throws', async () => {
    vi.mocked(introspectToken).mockRejectedValue(new Error('kc down'));

    await call(buildApp(), 'token');

    expect(auditLines()).toMatchObject([
      { status: 503, reason: 'auth_service_unavailable' },
    ]);
  });

  it('audits the real final status when the route handler throws', async () => {
    vi.mocked(introspectToken).mockResolvedValue({
      active: true,
      client_id: 'accounts-backend',
    });
    const app = buildApp({
      handler: () => {
        throw new Error('db down');
      },
    });

    await call(app, 'token');

    // 500 comes from the error handler, not from the middleware, and is still
    // audited — with the caller that made the failing request.
    expect(auditLines()).toMatchObject([
      { clientId: 'accounts-backend', sub: 'abc', status: 500 },
    ]);
    expect(auditLines()[0]).not.toHaveProperty('reason');
    // The guard authorized this request; the global error handler already logs
    // the failure at error level, so the audit line is not a second warning.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('audits an authorized request that answers 404 at info level', async () => {
    vi.mocked(introspectToken).mockResolvedValue({
      active: true,
      client_id: 'accounts-backend',
    });
    const app = buildApp({
      handler: (_req, res) =>
        res.status(404).json({ message: 'User not found' }),
    });

    await call(app, 'token');

    // An unknown subject is an expected answer to an allowed caller (Accounts
    // asking about a user who has never used Send), so it must not warn.
    expect(auditLines()).toMatchObject([
      { clientId: 'accounts-backend', status: 404 },
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
