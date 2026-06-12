import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADDON_ID_PROD, ADDON_ID_STAGE } from '../addonIds';
import { checkAndUninstallIfDeprecated } from '../selfUninstall';

const STAGE_ADDON_ID = ADDON_ID_STAGE;
const PROD_ADDON_ID = ADDON_ID_PROD;
const CUTOFF_VERSION = '140.0';

function setupBrowserMock(addonId: string, geckoVersion = '145.0') {
  vi.stubGlobal('browser', {
    runtime: {
      id: addonId,
      getBrowserInfo: vi.fn().mockResolvedValue({ version: geckoVersion }),
    },
    management: { uninstallSelf: vi.fn().mockResolvedValue(undefined) },
  });
}

function setEnvCutoff(version: string | undefined) {
  vi.stubEnv('VITE_DEPRECATION_VERSION', version ?? '');
}

beforeEach(() => {
  setEnvCutoff(CUTOFF_VERSION);
  setupBrowserMock(STAGE_ADDON_ID);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('checkAndUninstallIfDeprecated', () => {
  it('uninstalls when ID matches and gecko version >= cutoff', async () => {
    await checkAndUninstallIfDeprecated();

    expect(browser.management.uninstallSelf).toHaveBeenCalledOnce();
    expect(browser.management.uninstallSelf).toHaveBeenCalledWith({
      showConfirmDialog: false,
    });
  });

  it('uninstalls when gecko version equals the cutoff exactly', async () => {
    setupBrowserMock(STAGE_ADDON_ID, CUTOFF_VERSION);

    await checkAndUninstallIfDeprecated();

    expect(browser.management.uninstallSelf).toHaveBeenCalledOnce();
  });

  it('does not uninstall when gecko version is below cutoff', async () => {
    setupBrowserMock(STAGE_ADDON_ID, '139.0');

    await checkAndUninstallIfDeprecated();

    expect(browser.management.uninstallSelf).not.toHaveBeenCalled();
  });

  it('does not uninstall when addon ID does not match', async () => {
    setupBrowserMock(PROD_ADDON_ID);

    await checkAndUninstallIfDeprecated();

    expect(browser.management.uninstallSelf).not.toHaveBeenCalled();
  });

  it('does not uninstall when VITE_DEPRECATION_VERSION is not set', async () => {
    setEnvCutoff(undefined);

    await checkAndUninstallIfDeprecated();

    expect(browser.management.uninstallSelf).not.toHaveBeenCalled();
  });
});
