// The popup and the management page must show the same block screen for the
// same `settings` response: both bundles report appName 'addon' and render the
// shared CompatibilityBoundary. Only the transport and page bodies are mocked.
import AddonManagementPage from '@addon/apps/AddonManagementPage.vue';
import ExtensionPage from '@send-frontend/apps/send/ExtensionPage.vue';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { mountWithPlugins } from './testingUtils';

const { settingsQuery } = vi.hoisted(() => ({ settingsQuery: vi.fn() }));

vi.mock('@send-frontend/lib/trpc', () => ({
  trpc: { settings: { query: settingsQuery } },
}));
vi.mock('@send-frontend/lib/init', () => ({ default: vi.fn() }));
vi.mock('@send-frontend/apps/send/stores/folder-store', () => ({
  default: () => ({}),
}));
vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: () => ({ keychain: {} }),
}));
vi.mock('@send-frontend/stores/user-store', () => ({
  default: () => ({ user: {} }),
}));
vi.mock('@send-frontend/stores/metrics', () => ({
  default: () => ({ initializeClientMetrics: vi.fn() }),
}));
vi.mock('@send-frontend/apps/common/mixins/metrics', () => ({
  useMetricsUpdate: vi.fn(),
}));
vi.mock('@send-frontend/lib/auth', () => ({
  useAuth: () => ({
    isLoggedIn: ref(false),
    isLoadingAuth: ref(false),
    refetchAuth: vi.fn(),
  }),
}));
vi.mock('@send-frontend/stores', () => ({
  useAuthStore: () => ({ loginToOIDC: vi.fn() }),
}));

const stubs = {
  PopupView: true,
  AdminPage: true,
  AuthButtons: true,
  TbproLogo: true,
  VersionTag: true,
  PrimaryButton: { template: '<button><slot /></button>' },
};

async function blockText(page: unknown) {
  const wrapper = mountWithPlugins(page, { stubs });
  await flushPromises();
  const text = (id: string) =>
    wrapper.find(`[data-testid="${id}"]`).text().trim();
  return {
    title: text('client-gate-title'),
    message: text('client-gate-message'),
  };
}

describe('client gate parity across add-on pages', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    settingsQuery.mockReset();
    vi.stubGlobal('browser', {
      runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    {
      case: 'server text',
      gate: { title: 'Time to update', message: 'Version 9 is required.' },
      expected: { title: 'Time to update', message: 'Version 9 is required.' },
    },
    {
      case: 'no server text',
      gate: { title: null, message: null },
      expected: {
        title: 'Update Thunderbird to continue using Send',
        message: 'This version of the Send add-on is no longer supported.',
      },
    },
    {
      case: 'non-string server text',
      gate: { title: 7, message: { text: 'x' } },
      expected: {
        title: 'Update Thunderbird to continue using Send',
        message: 'This version of the Send add-on is no longer supported.',
      },
    },
  ])('shows the same block title and message for $case', async (c) => {
    settingsQuery.mockResolvedValue({
      clientGate: { action: 'block', minVersion: '9.9.9', ...c.gate },
    });

    const popup = await blockText(ExtensionPage);
    const management = await blockText(AddonManagementPage);

    expect(popup).toEqual(c.expected);
    expect(management).toEqual(popup);
    expect(settingsQuery).toHaveBeenCalledTimes(2);
    for (const [input] of settingsQuery.mock.calls) {
      expect(input).toMatchObject({ appName: 'addon' });
    }
  });
});
