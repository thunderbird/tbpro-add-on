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

function settings(
  version: string,
  appName: string | null,
  extra: Record<string, unknown> = {}
) {
  return (
    usersRouter
      .createCaller(anonymousCtx as never)
      // @ts-ignore -- old clients send no runtime; unknown values are tested too
      .settings({ version, appName, ...extra })
  );
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
      clientGate: {
        action: 'none',
        minVersion: null,
        title: null,
        message: null,
      },
    });
  });

  it('blocks an outdated add-on and reports FORCE_UPDATE to old clients', async () => {
    vi.stubEnv('CLIENT_MIN_VERSION_ADDON', '9.9.9');
    vi.stubEnv('CLIENT_GATE_MODE', 'block');
    vi.stubEnv('CLIENT_GATE_TITLE_ADDON', 'Update Thunderbird');
    vi.stubEnv('CLIENT_GATE_MESSAGE_ADDON', 'Update now');

    const result = await settings('2.0.24', 'addon');

    expect(result.clientGate).toEqual({
      action: 'block',
      minVersion: '9.9.9',
      title: 'Update Thunderbird',
      message: 'Update now',
    });
    expect(result.compatibility.result).toBe('FORCE_UPDATE');
  });

  it('shows a banner to an outdated web client as PROMPT_UPDATE', async () => {
    vi.stubEnv('CLIENT_MIN_VERSION_WEB', '9.9.9');
    vi.stubEnv('CLIENT_GATE_MODE', 'banner');
    vi.stubEnv('CLIENT_GATE_MESSAGE_WEB', '');
    vi.stubEnv('CLIENT_GATE_MESSAGE', 'Generic notice');

    const result = await settings('8.0.19', 'send-frontend');

    expect(result.clientGate).toMatchObject({
      action: 'banner',
      title: null,
      message: 'Generic notice',
    });
    expect(result.compatibility.result).toBe('PROMPT_UPDATE');
  });

  it('no longer flags a different major version without a configured minimum', async () => {
    vi.stubEnv('CLIENT_MIN_VERSION_WEB', '');

    const result = await settings('1.0.0', 'send-frontend');

    expect(result.clientGate.action).toBe('none');
    expect(result.compatibility.result).toBe('COMPATIBLE');
  });

  it.each([
    ['without a runtime (old clients)', {}],
    ['with runtime thunderbird', { runtime: 'thunderbird' }],
    ['with runtime browser', { runtime: 'browser' }],
    ['with an unknown runtime', { runtime: 'toaster' }],
    ['with extra fields', { runtime: 'browser', future: true }],
  ])('accepts a request %s', async (_, extra) => {
    vi.stubEnv('CLIENT_MIN_VERSION_WEB', '');

    await expect(
      settings('1.0.0', 'send-frontend', extra)
    ).resolves.toMatchObject({ clientGate: { action: 'none' } });
  });
});
