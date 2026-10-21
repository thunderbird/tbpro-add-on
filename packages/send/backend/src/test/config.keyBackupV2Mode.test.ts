import { afterEach, describe, expect, it, vi } from 'vitest';
import { getKeyBackupV2Mode } from '../config';

describe('getKeyBackupV2Mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('defaults to off when unset', () => {
    vi.stubEnv('KEY_BACKUP_V2_MODE', '');
    expect(getKeyBackupV2Mode()).toBe('off');
  });

  it.each(['off', 'optin', 'auto'])('accepts %s', (mode) => {
    vi.stubEnv('KEY_BACKUP_V2_MODE', mode);
    expect(getKeyBackupV2Mode()).toBe(mode);
  });

  it('ignores case and surrounding whitespace', () => {
    vi.stubEnv('KEY_BACKUP_V2_MODE', ' Auto ');
    expect(getKeyBackupV2Mode()).toBe('auto');
  });

  it('reads the value at call time', () => {
    vi.stubEnv('KEY_BACKUP_V2_MODE', 'optin');
    expect(getKeyBackupV2Mode()).toBe('optin');
    vi.stubEnv('KEY_BACKUP_V2_MODE', 'off');
    expect(getKeyBackupV2Mode()).toBe('off');
  });

  it('falls back to off and warns on an unknown value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('KEY_BACKUP_V2_MODE', 'yes-please');

    expect(getKeyBackupV2Mode()).toBe('off');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('yes-please'));
  });
});
