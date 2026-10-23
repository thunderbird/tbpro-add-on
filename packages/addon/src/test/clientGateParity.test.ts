// Inside Thunderbird the popup, the management page and the web app opened in a
// Thunderbird tab must show the same block screen: all report runtime
// 'thunderbird' and render the shared CompatibilityBoundary. The fake server
// answers by runtime, like the real one. Only transport and page bodies are mocked.
import AddonManagementPage from '@addon/apps/AddonManagementPage.vue';
import ExtensionPage from '@send-frontend/apps/send/ExtensionPage.vue';
import SendPage from '@send-frontend/apps/send/SendPage.vue';
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
  useMetricsUpdate: vi.fn(() => ({ updateMetricsIdentity: vi.fn() })),
}));
vi.mock('@send-frontend/apps/send/views/SendTemplate.vue', () => ({
  default: { template: '<div><slot /></div>' },
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
  ModalsContainer: true,
  RouterView: true,
  PrimaryButton: { template: '<button><slot /></button>' },
};

const THUNDERBIRD_UA =
  'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Thunderbird/140.0';
const FIREFOX_UA =
  'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

function useUserAgent(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

// Mirrors the server: Thunderbird gets the add-on text, a browser the web text.
function serveBlock(addon: object, web: object) {
  settingsQuery.mockImplementation(async ({ runtime }) => ({
    clientGate: {
      action: 'block',
      minVersion: '9.9.9',
      ...(runtime === 'thunderbird' ? addon : web),
    },
  }));
}

async function blockText(page: unknown) {
  const wrapper = mountWithPlugins(page, { stubs });
  await flushPromises();
  const find = (id: string) => wrapper.find(`[data-testid="${id}"]`);
  const message = find('client-gate-message');
  return {
    title: find('client-gate-title').text().trim(),
    message: message.text().trim(),
    bold: message.classes().includes('emphasis'),
    button: find('client-gate-how-to-update').exists()
      ? 'How to update'
      : find('refresh-button').exists()
        ? 'Reload'
        : null,
    versionLine: find('client-gate-versions').exists(),
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
    vi.restoreAllMocks();
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
  ])('shows the same Thunderbird block screen for $case', async (c) => {
    useUserAgent(THUNDERBIRD_UA);
    serveBlock(c.gate, { title: 'Web title', message: 'Web message' });

    const popup = await blockText(ExtensionPage);
    const management = await blockText(AddonManagementPage);
    const webInThunderbird = await blockText(SendPage);

    expect(popup).toEqual({
      ...c.expected,
      bold: true,
      button: 'How to update',
      versionLine: false,
    });
    expect(management).toEqual(popup);
    expect(webInThunderbird).toEqual(popup);
    expect(settingsQuery).toHaveBeenCalledTimes(3);
    for (const [input] of settingsQuery.mock.calls) {
      expect(input).toMatchObject({ runtime: 'thunderbird' });
    }
  });

  it('shows the browser block screen to the web app outside Thunderbird', async () => {
    useUserAgent(FIREFOX_UA);
    serveBlock(
      { title: 'Add-on title', message: 'Add-on message' },
      { title: 'Web title', message: 'Web message' }
    );

    expect(await blockText(SendPage)).toEqual({
      title: 'Web title',
      message: 'Web message',
      bold: true,
      button: 'Reload',
      versionLine: true,
    });
    expect(settingsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ runtime: 'browser' })
    );
  });
});
