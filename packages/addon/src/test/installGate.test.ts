import { describe, expect, it } from 'vitest';

import {
  ADDON_ID_PROD,
  ADDON_ID_STAGE,
  ADDON_ID_SYSTEM,
} from '../addonIds';
import { shouldAutoOpenLoginOnInstall } from '../installGate';

/**
 * Regression guard for Bug 2036665: a fresh, never-signed-in profile must make
 * zero outbound connections at startup. The built-in system add-on installs on
 * every fresh Thunderbird profile (including under automation), so it must not
 * auto-open BASE_URL/login. The standalone add-on keeps its first-run onboarding.
 */
describe('shouldAutoOpenLoginOnInstall', () => {
  it('does NOT auto-open for the built-in system add-on on install', () => {
    expect(shouldAutoOpenLoginOnInstall('install', ADDON_ID_SYSTEM)).toBe(false);
  });

  it('auto-opens for the standalone prod and stage add-ons on install', () => {
    expect(shouldAutoOpenLoginOnInstall('install', ADDON_ID_PROD)).toBe(true);
    expect(shouldAutoOpenLoginOnInstall('install', ADDON_ID_STAGE)).toBe(true);
  });

  it('never auto-opens on update/browser_update', () => {
    expect(shouldAutoOpenLoginOnInstall('update', ADDON_ID_PROD)).toBe(false);
    expect(shouldAutoOpenLoginOnInstall('browser_update', ADDON_ID_PROD)).toBe(
      false
    );
    expect(shouldAutoOpenLoginOnInstall('update', ADDON_ID_SYSTEM)).toBe(false);
  });

  it('does not auto-open when the runtime id is unavailable', () => {
    expect(shouldAutoOpenLoginOnInstall('install', undefined)).toBe(false);
  });
});
