import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compareSemver,
  getClientGate,
  parseSemver,
  resetClientGateWarnings,
  toLegacyCompatibilityResult,
} from './compatibility';

const GATE_KEYS = [
  'CLIENT_MIN_VERSION_ADDON',
  'CLIENT_MIN_VERSION_WEB',
  'CLIENT_GATE_MODE',
  'CLIENT_GATE_MESSAGE',
] as const;

function setEnv(values: Partial<Record<(typeof GATE_KEYS)[number], string>>) {
  for (const key of GATE_KEYS) {
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
}

function compare(a: string, b: string) {
  return compareSemver(parseSemver(a)!, parseSemver(b)!);
}

describe('parseSemver', () => {
  it.each(['1.2.3', 'v1.2.3', ' 1.2.3 ', '1.2.3-beta.1', '1.2.3+build.7'])(
    'accepts %s',
    (version) => {
      expect(parseSemver(version)).not.toBeNull();
    }
  );

  it.each([
    '',
    '1',
    '1.2',
    '1.2.3.4',
    'a.b.c',
    '1.2.x',
    '1.2.3-',
    '1.2.3-a..b',
    '1.2.3+',
    '1.2.3+bad..build',
    '1.2.3+a+b',
  ])('rejects %j', (version) => {
    expect(parseSemver(version)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(parseSemver(undefined)).toBeNull();
    expect(parseSemver(123)).toBeNull();
  });
});

describe('compareSemver', () => {
  it.each([
    ['1.2.3', '1.2.3', 0],
    ['1.2.3', '1.2.4', -1],
    ['1.10.0', '1.9.9', 1],
    ['2.0.0', '10.0.0', -1],
    ['1.2.3-beta', '1.2.3', -1],
    ['1.2.3', '1.2.3-beta', 1],
    ['1.2.3-alpha', '1.2.3-beta', -1],
    ['1.2.3-beta.2', '1.2.3-beta.10', -1],
    ['1.2.3-1', '1.2.3-alpha', -1],
    ['1.2.3-beta', '1.2.3-beta.1', -1],
    ['1.2.3+a', '1.2.3+b', 0],
  ])('%s vs %s → %i', (a, b, expected) => {
    expect(compare(a, b)).toBe(expected);
  });
});

describe('getClientGate', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetClientGateWarnings();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    setEnv({});
    vi.restoreAllMocks();
  });

  it('is off when no minimum is configured', () => {
    setEnv({ CLIENT_GATE_MODE: 'block' });
    expect(getClientGate('0.0.1', 'addon')).toEqual({
      action: 'none',
      minVersion: null,
      message: null,
    });
    expect(getClientGate('0.0.1', 'send-frontend').action).toBe('none');
    expect(warn).not.toHaveBeenCalled();
  });

  describe.each([
    { client: 'addon', appName: 'addon', key: 'CLIENT_MIN_VERSION_ADDON' },
    { client: 'web', appName: 'send-frontend', key: 'CLIENT_MIN_VERSION_WEB' },
    {
      client: 'web (null appName)',
      appName: null,
      key: 'CLIENT_MIN_VERSION_WEB',
    },
  ] as const)('$client', ({ appName, key }) => {
    describe.each(['banner', 'block'] as const)('mode %s', (mode) => {
      beforeEach(() => {
        setEnv({ [key]: '2.0.25', CLIENT_GATE_MODE: mode });
      });

      it('applies the mode below the minimum', () => {
        expect(getClientGate('2.0.24', appName)).toEqual({
          action: mode,
          minVersion: '2.0.25',
          message: null,
        });
      });

      it('is off at the minimum', () => {
        expect(getClientGate('2.0.25', appName)).toEqual({
          action: 'none',
          minVersion: '2.0.25',
          message: null,
        });
      });

      it('is off above the minimum', () => {
        expect(getClientGate('2.1.0', appName).action).toBe('none');
      });
    });

    it('ignores the other client type’s minimum', () => {
      const other =
        key === 'CLIENT_MIN_VERSION_ADDON'
          ? 'CLIENT_MIN_VERSION_WEB'
          : 'CLIENT_MIN_VERSION_ADDON';
      setEnv({ [other]: '99.0.0', CLIENT_GATE_MODE: 'block' });
      expect(getClientGate('1.0.0', appName).action).toBe('none');
    });
  });

  it('no longer exempts the add-on', () => {
    setEnv({ CLIENT_MIN_VERSION_ADDON: '9.9.9', CLIENT_GATE_MODE: 'block' });
    expect(getClientGate('2.0.24', 'addon').action).toBe('block');
  });

  it('defaults to banner when the mode is unset', () => {
    setEnv({ CLIENT_MIN_VERSION_WEB: '9.9.9' });
    expect(getClientGate('8.0.19', 'send-frontend').action).toBe('banner');
  });

  it('returns the configured message only when gated', () => {
    setEnv({
      CLIENT_MIN_VERSION_WEB: '9.0.0',
      CLIENT_GATE_MODE: 'block',
      CLIENT_GATE_MESSAGE: '  Please update.  ',
    });
    expect(getClientGate('8.0.0', 'send-frontend').message).toBe(
      'Please update.'
    );
    expect(getClientGate('9.0.0', 'send-frontend').message).toBeNull();
  });

  it('fails open for a malformed client version', () => {
    setEnv({ CLIENT_MIN_VERSION_WEB: '9.0.0', CLIENT_GATE_MODE: 'block' });
    expect(getClientGate('not-a-version', 'send-frontend').action).toBe('none');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    { CLIENT_MIN_VERSION_WEB: '9.0' },
    { CLIENT_MIN_VERSION_WEB: 'latest' },
    { CLIENT_MIN_VERSION_WEB: '9.0.0+' },
    { CLIENT_MIN_VERSION_WEB: '9.0.0', CLIENT_GATE_MODE: 'lockout' },
  ])('is off with one warning for invalid config %j', (config) => {
    setEnv(config);
    expect(getClientGate('1.0.0', 'send-frontend')).toEqual({
      action: 'none',
      minVersion: null,
      message: null,
    });
    getClientGate('1.0.0', 'send-frontend');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reads the config on every call', () => {
    setEnv({ CLIENT_MIN_VERSION_WEB: '9.0.0' });
    expect(getClientGate('8.0.0', 'send-frontend').action).toBe('banner');
    setEnv({});
    expect(getClientGate('8.0.0', 'send-frontend').action).toBe('none');
  });
});

describe('toLegacyCompatibilityResult', () => {
  it.each([
    ['none', 'COMPATIBLE'],
    ['banner', 'PROMPT_UPDATE'],
    ['block', 'FORCE_UPDATE'],
  ] as const)('%s → %s', (action, result) => {
    expect(toLegacyCompatibilityResult(action)).toBe(result);
  });
});
