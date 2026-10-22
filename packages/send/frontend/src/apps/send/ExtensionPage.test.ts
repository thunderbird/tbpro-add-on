import { ALL_UPLOADS_ABORTED } from '@send-frontend/lib/const';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import ExtensionPage from './ExtensionPage.vue';

const { gate } = vi.hoisted(() => ({ gate: { action: 'none' } }));

vi.mock('@send-frontend/composables/useClientGate', () => ({
  useClientGate: () => ({
    gate: ref({ action: gate.action, minVersion: '9.9.9', message: null }),
    clientVersion: '1.0.0',
    error: ref(null),
  }),
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
vi.mock('../send/stores/config-store', () => ({
  useConfigStore: () => ({
    isTbproExtension: true,
    isDev: false,
    isProd: true,
  }),
}));
vi.mock('@vueuse/core', () => ({ usePreferredDark: () => ref(false) }));

const stubs = {
  PopupView: { template: '<div data-testid="popup-view" />' },
  VersionTag: true,
  PrimaryButton: { template: '<button><slot /></button>' },
};

describe('ExtensionPage client gate', () => {
  const sendMessage = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    sendMessage.mockClear();
    vi.stubGlobal('browser', { runtime: { sendMessage } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('releases pending uploads once when blocked', async () => {
    gate.action = 'block';
    const wrapper = mount(ExtensionPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find('[data-testid="popup-view"]').exists()).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: ALL_UPLOADS_ABORTED,
      aborted: true,
    });
  });

  it.each(['none', 'banner'])('keeps uploads for %s', async (action) => {
    gate.action = action;
    const wrapper = mount(ExtensionPage, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find('[data-testid="popup-view"]').exists()).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
