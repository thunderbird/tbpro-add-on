import {
  assertConfigured,
  config,
  SIBLING_URL_DEFAULTS,
} from '@send-frontend/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `import.meta.env` is typed with an index signature of `any`, so read it through
// an explicit record when looking a key up by name.
const env = import.meta.env as unknown as Record<string, string | undefined>;

// Guard the near-identical getters against copy-paste / rebase errors: each key
// must prefer its runtime value AND fall back to its OWN VITE_* env var (every
// one pinned to a distinct sentinel in vitest.config.js `define`, so a crossed
// fallback produces a mismatched value instead of `undefined === undefined`).
//
// This list must stay in lockstep with `buildEnv` in src/config.ts, the key list
// in the committed public/config.js, and the jq object in
// docker/docker-entrypoint.d/40-send-config.sh.
const PLAIN_KEYS: Array<[keyof typeof config, string]> = [
  ['sendServerUrl', 'VITE_SEND_SERVER_URL'],
  ['sendClientUrl', 'VITE_SEND_CLIENT_URL'],
  ['oidcRootUrl', 'VITE_OIDC_ROOT_URL'],
  ['oidcClientId', 'VITE_OIDC_CLIENT_ID'],
  ['allowPublicLogin', 'VITE_ALLOW_PUBLIC_LOGIN'],
  ['sentryDsn', 'VITE_SENTRY_DSN'],
  ['posthogProjectKey', 'VITE_POSTHOG_PROJECT_KEY'],
  ['posthogHost', 'VITE_POSTHOG_HOST'],
  ['splitSizeInMb', 'VITE_SPLIT_SIZE_IN_MB'],
  ['loggerLevel', 'VITE_LOGGER_LEVEL'],
  ['uploadHttpRetryLimit', 'VITE_UPLOAD_HTTP_RETRY_LIMIT'],
  ['uploadHttpRetryBaseDelayMs', 'VITE_UPLOAD_HTTP_RETRY_BASE_DELAY_MS'],
];

// One table for all four sibling-URL test sites, so a key added to one list
// cannot silently lose coverage in another.
const SIBLING_KEYS: Array<
  [keyof typeof SIBLING_URL_DEFAULTS.production, string]
> = [
  ['accountsUrl', 'VITE_ACCOUNTS_URL'],
  ['dashboardUrl', 'VITE_DASHBOARD_URL'],
  ['contactFormUrl', 'VITE_CONTACT_FORM_URL'],
  ['thundermailUrl', 'VITE_THUNDERMAIL_URL'],
  ['appointmentUrl', 'VITE_APPOINTMENT_URL'],
];

const ALL_KEYS = [...PLAIN_KEYS, ...SIBLING_KEYS, ['appEnv', 'VITE_APP_ENV']];

describe('runtime config accessor', () => {
  afterEach(() => {
    delete window.__APP_CONFIG__;
  });

  it('prefers window.__APP_CONFIG__ when a value is present', () => {
    window.__APP_CONFIG__ = {
      sendServerUrl: 'https://runtime.example.test',
      appEnv: 'mzla-tb-dev',
    };
    expect(config.sendServerUrl).toBe('https://runtime.example.test');
    expect(config.appEnv).toBe('mzla-tb-dev');
  });

  it('falls back to build-time import.meta.env when the runtime value is absent', () => {
    delete window.__APP_CONFIG__;
    expect(config.sendServerUrl).toBe(import.meta.env.VITE_SEND_SERVER_URL);
  });

  // Invariant: "empty string means unset". This is the single rule that lets the
  // committed all-empty public/config.js fall through to a baked build, so the
  // S3/ECS deploy and the add-on XPI keep working unchanged.
  it('treats an empty runtime string as unset and falls back', () => {
    window.__APP_CONFIG__ = { sendServerUrl: '' };
    expect(config.sendServerUrl).toBe(import.meta.env.VITE_SEND_SERVER_URL);
  });

  it('resolves getters at call time (reflects a later window mutation)', () => {
    delete window.__APP_CONFIG__;
    expect(config.sendClientUrl).toBe(import.meta.env.VITE_SEND_CLIENT_URL);
    window.__APP_CONFIG__ = { sendClientUrl: 'https://later.example.test' };
    expect(config.sendClientUrl).toBe('https://later.example.test');
  });

  it('a partial runtime object still falls back per-key for unset keys', () => {
    window.__APP_CONFIG__ = { sendClientUrl: 'https://later.example.test' };
    expect(config.sendClientUrl).toBe('https://later.example.test');
    expect(config.sendServerUrl).toBe(import.meta.env.VITE_SEND_SERVER_URL);
  });

  it.each(ALL_KEYS)('runtime value wins for %s', (key) => {
    window.__APP_CONFIG__ = { [key]: `rt-${key}` };
    expect(config[key as keyof typeof config]).toBe(`rt-${key}`);
  });

  it.each(ALL_KEYS)(
    'an empty runtime value for %s is treated as unset',
    (key) => {
      delete window.__APP_CONFIG__;
      const withoutRuntime = config[key as keyof typeof config];
      window.__APP_CONFIG__ = { [key]: '' };
      expect(config[key as keyof typeof config]).toBe(withoutRuntime);
    }
  );

  it.each(PLAIN_KEYS)(
    '%s falls back to its own env var when runtime is unset',
    (key, envVar) => {
      delete window.__APP_CONFIG__;
      expect(config[key]).toBe(env[envVar]);
    }
  );

  // config.js is an operator-editable contract: a hand-authored (e.g.
  // Helm-templated) file can plausibly carry an unquoted boolean or number.
  // pick() coerces those to strings so `=== 'true'`-style consumers keep
  // working instead of silently failing on a raw boolean.
  it('coerces a non-string runtime value to a string', () => {
    window.__APP_CONFIG__ = {
      allowPublicLogin: true,
      splitSizeInMb: 250,
    } as never;
    expect(config.allowPublicLogin).toBe('true');
    expect(config.splitSizeInMb).toBe('250');
  });
});

describe('sibling service URLs', () => {
  afterEach(() => {
    delete window.__APP_CONFIG__;
  });

  // These have a last-resort default, so they never resolve to undefined -- that
  // is what keeps the add-on XPI (which bakes no sibling URLs) rendering working
  // links. The sibling VITE_* vars are pinned EMPTY in vitest.config.js, so these
  // assert the literal defaults -- the assertions cannot silently degrade on a
  // machine whose local .env bakes a value.
  it.each(SIBLING_KEYS)(
    '%s uses the production default when appEnv is production',
    (key) => {
      window.__APP_CONFIG__ = { appEnv: 'production' };
      expect(config[key]).toBe(SIBLING_URL_DEFAULTS.production[key]);
    }
  );

  // The regression this pins down: before the refactor a non-production build got
  // the `-stage` sibling URLs via `BASE_URL.includes('send.tb.pro')`. Collapsing to
  // a single production default would silently point stage users -- and the stage
  // add-on -- at production accounts.
  it.each(SIBLING_KEYS)(
    '%s uses the non-production default for any other appEnv',
    (key) => {
      window.__APP_CONFIG__ = { appEnv: 'staging' };
      expect(config[key]).toBe(SIBLING_URL_DEFAULTS.nonProduction[key]);
      window.__APP_CONFIG__ = { appEnv: 'mzla-tb-dev' };
      expect(config[key]).toBe(SIBLING_URL_DEFAULTS.nonProduction[key]);
    }
  );

  it('an explicit value overrides the default in either direction', () => {
    window.__APP_CONFIG__ = {
      appEnv: 'production',
      accountsUrl: 'https://accounts.tb-dev.example.test',
    };
    expect(config.accountsUrl).toBe('https://accounts.tb-dev.example.test');
  });
});

describe('appEnv', () => {
  afterEach(() => {
    delete window.__APP_CONFIG__;
  });

  it('never resolves to an empty string', () => {
    delete window.__APP_CONFIG__;
    expect(config.appEnv).toBeTruthy();
    window.__APP_CONFIG__ = { appEnv: '' };
    expect(config.appEnv).toBeTruthy();
  });

  it('accepts an arbitrary environment name (not just the three well-known ones)', () => {
    window.__APP_CONFIG__ = { appEnv: 'mzla-tb-dev' };
    expect(config.appEnv).toBe('mzla-tb-dev');
  });

  // FAIL-SAFE INVARIANT: an undeclared environment must NEVER resolve to
  // `production` -- background.ts derives THUNDERMAIL_HOST from it and the
  // sibling defaults pick the production accounts stack. See resolveAppEnv().
  it('never resolves to production when nothing is declared', () => {
    delete window.__APP_CONFIG__;
    expect(config.appEnv).not.toBe('production');
    window.__APP_CONFIG__ = { appEnv: '' };
    expect(config.appEnv).not.toBe('production');
  });
});

describe('assertConfigured', () => {
  afterEach(() => {
    delete window.__APP_CONFIG__;
  });

  // Only the web-app entry calls this; it must pass whenever the baked fallbacks
  // are present, which is the case for dev, the S3/ECS build and the tests.
  it('passes when both required values resolve', () => {
    delete window.__APP_CONFIG__;
    expect(() => assertConfigured()).not.toThrow();
  });

  // The getter is replaced wholesale (runtime AND baked fallback), so these
  // exercise only assertConfigured's own filter -- pick()'s resolution is
  // covered by the accessor tests above.
  it('throws and names APP_SEND_SERVER_URL when the server URL is unset', () => {
    const spy = vi
      .spyOn(config, 'sendServerUrl', 'get')
      .mockReturnValue(undefined);
    expect(() => assertConfigured()).toThrowError(/APP_SEND_SERVER_URL/);
    spy.mockRestore();
  });

  it('throws and names APP_SEND_CLIENT_URL when the client URL is unset', () => {
    const spy = vi
      .spyOn(config, 'sendClientUrl', 'get')
      .mockReturnValue(undefined);
    expect(() => assertConfigured()).toThrowError(/APP_SEND_CLIENT_URL/);
    spy.mockRestore();
  });

  it('names BOTH APP_ vars when both required values are missing', () => {
    const serverSpy = vi
      .spyOn(config, 'sendServerUrl', 'get')
      .mockReturnValue(undefined);
    const clientSpy = vi
      .spyOn(config, 'sendClientUrl', 'get')
      .mockReturnValue(undefined);
    expect(() => assertConfigured()).toThrowError(
      /APP_SEND_SERVER_URL.*APP_SEND_CLIENT_URL/
    );
    serverSpy.mockRestore();
    clientSpy.mockRestore();
  });
});
