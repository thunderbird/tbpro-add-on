import { VERSION } from '@send-backend/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usersRouter } from '../../trpc/users';

// `settings` is public and called before login, so no auth/models are needed.
vi.mock('@prisma/client', () => ({ PrismaClient: class {} }));
vi.mock('@send-backend/models', () => ({}));
vi.mock('@send-backend/models/users', () => ({}));

const anonymousCtx = {
  res: { setHeader: vi.fn() },
  authorization: null,
  cookies: {},
  oidcUser: null,
  user: null,
};

function settings(version: string, appName: string | null) {
  //@ts-ignore
  return usersRouter.createCaller(anonymousCtx).settings({ version, appName });
}

describe('settings: client update gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns no gate and a COMPATIBLE legacy result by default', async () => {
    vi.stubEnv('CLIENT_MIN_VERSION_ADDON', '');
    vi.stubEnv('CLIENT_MIN_VERSION_WEB', '');

    await expect(settings('0.0.1', 'addon')).resolves.toEqual({
      apiVersion: VERSION,
      clientVersion: '0.0.1',
      compatibility: { resolvedCompatibility: true, result: 'COMPATIBLE' },
      clientGate: { action: 'none', minVersion: null, message: null },
    });
  });

  it('blocks an outdated add-on and reports FORCE_UPDATE to old clients', async () => {
    vi.stubEnv('CLIENT_MIN_VERSION_ADDON', '9.9.9');
    vi.stubEnv('CLIENT_GATE_MODE', 'block');
    vi.stubEnv('CLIENT_GATE_MESSAGE', 'Update now');

    const result = await settings('2.0.24', 'addon');

    expect(result.clientGate).toEqual({
      action: 'block',
      minVersion: '9.9.9',
      message: 'Update now',
    });
    expect(result.compatibility.result).toBe('FORCE_UPDATE');
  });

  it('shows a banner to an outdated web client as PROMPT_UPDATE', async () => {
    vi.stubEnv('CLIENT_MIN_VERSION_WEB', '9.9.9');
    vi.stubEnv('CLIENT_GATE_MODE', 'banner');

    const result = await settings('8.0.19', 'send-frontend');

    expect(result.clientGate.action).toBe('banner');
    expect(result.compatibility.result).toBe('PROMPT_UPDATE');
  });

  it('no longer flags a different major version without a configured minimum', async () => {
    vi.stubEnv('CLIENT_MIN_VERSION_WEB', '');

    const result = await settings('1.0.0', 'send-frontend');

    expect(result.clientGate.action).toBe('none');
    expect(result.compatibility.result).toBe('COMPATIBLE');
  });
});
