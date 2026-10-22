import { getByTestId } from '@send-frontend/lib/testUtils';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import CompatibilityBoundary from './CompatibilityBoundary.vue';

const { query, settingsQuery, config, prefersDark } = vi.hoisted(() => ({
  query: { data: null, error: null } as {
    data: unknown;
    error: unknown;
    options?: { queryFn: () => Promise<unknown> };
  },
  settingsQuery: vi.fn(),
  config: { isTbproExtension: false, isDev: false },
  prefersDark: { value: false },
}));

vi.mock('@send-frontend/lib/trpc', () => ({
  trpc: { settings: { query: settingsQuery } },
}));
vi.mock('@tanstack/vue-query', () => ({
  useQuery: vi.fn((options) => {
    query.options = options;
    return { data: ref(query.data), error: ref(query.error) };
  }),
}));
vi.mock('../send/stores/config-store', () => ({
  useConfigStore: () => config,
}));
vi.mock('@vueuse/core', () => ({
  usePreferredDark: () => ref(prefersDark.value),
}));

const stubs = { PrimaryButton: { template: '<button><slot /></button>' } };
const SLOT = '<div data-testid="app-content">App</div>';

function gate(action: string, minVersion = '9.9.9', message = null) {
  return { clientGate: { action, minVersion, message } };
}

function mountBoundary() {
  return mount(CompatibilityBoundary, {
    slots: { default: SLOT },
    global: { stubs },
  });
}

describe('CompatibilityBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.data = null;
    query.error = null;
    config.isTbproExtension = false;
    config.isDev = false;
    prefersDark.value = false;
  });

  it('asks the server with this build’s version and app name', async () => {
    mountBoundary();
    await query.options?.queryFn();
    expect(settingsQuery).toHaveBeenCalledWith({
      version: __APP_VERSION__,
      appName: __APP_NAME__,
    });
  });

  it('renders the app while settings are loading', () => {
    const wrapper = mountBoundary();
    expect(wrapper.find(getByTestId('app-content')).exists()).toBe(true);
    expect(wrapper.find(getByTestId('force-update-banner')).exists()).toBe(
      false
    );
  });

  it('renders the app when settings fail', () => {
    query.error = new Error('Failed to fetch');
    const wrapper = mountBoundary();
    expect(wrapper.find(getByTestId('app-content')).exists()).toBe(true);
    expect(wrapper.find(getByTestId('error')).exists()).toBe(false);
  });

  it('adds the local certificate hint in development', () => {
    config.isDev = true;
    query.error = new Error('Failed to fetch');
    const wrapper = mountBoundary();
    expect(wrapper.find(getByTestId('error')).exists()).toBe(true);
    expect(wrapper.find(getByTestId('app-content')).exists()).toBe(true);
  });

  it('renders the app when a refetch fails over a cached block', () => {
    query.data = gate('block');
    query.error = new Error('Failed to fetch');
    const wrapper = mountBoundary();
    expect(wrapper.find(getByTestId('app-content')).exists()).toBe(true);
    expect(wrapper.emitted('blocked')).toBeUndefined();
  });

  it('renders the app for an old server without clientGate', () => {
    query.data = { compatibility: { result: 'FORCE_UPDATE' } };
    const wrapper = mountBoundary();
    expect(wrapper.find(getByTestId('app-content')).exists()).toBe(true);
  });

  it.each(['none', 'banner'])('renders the app for %s', (action) => {
    query.data = gate(action);
    const wrapper = mountBoundary();
    expect(wrapper.find(getByTestId('app-content')).exists()).toBe(true);
    expect(wrapper.find(getByTestId('force-update-banner')).exists()).toBe(
      false
    );
  });

  describe('block', () => {
    beforeEach(() => {
      query.data = gate('block');
    });

    it('emits blocked so the host can release pending work', () => {
      const wrapper = mountBoundary();
      expect(wrapper.emitted('blocked')).toHaveLength(1);
    });

    it('replaces the app with the web update screen', () => {
      const wrapper = mountBoundary();
      const block = wrapper.find(getByTestId('force-update-banner'));

      expect(wrapper.find(getByTestId('app-content')).exists()).toBe(false);
      expect(block.text()).toContain('Reload to continue using Send');
      expect(block.text()).toContain(
        `You are using version ${__APP_VERSION__}; version 9.9.9 or newer is required.`
      );
      expect(wrapper.findComponent({ name: 'FeedbackBox' }).exists()).toBe(
        true
      );
      // The build version changes every release; keep the snapshot stable.
      expect(
        block.html().replaceAll(__APP_VERSION__, '<client-version>')
      ).toMatchSnapshot();
    });

    it('reloads the page from the web screen', async () => {
      const reload = vi.fn();
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...window.location,
        reload,
      });
      const wrapper = mountBoundary();
      await wrapper.find(getByTestId('refresh-button')).trigger('click');
      expect(reload).toHaveBeenCalled();
      vi.restoreAllMocks();
    });

    it('shows add-on update instructions on demand', async () => {
      config.isTbproExtension = true;
      const wrapper = mountBoundary();

      expect(wrapper.text()).toContain(
        'Update Thunderbird to continue using Send'
      );
      expect(wrapper.find(getByTestId('refresh-button')).exists()).toBe(false);
      expect(
        wrapper.find(getByTestId('client-gate-instructions')).exists()
      ).toBe(false);

      await wrapper
        .find(getByTestId('client-gate-how-to-update'))
        .trigger('click');
      expect(
        wrapper.find(getByTestId('client-gate-instructions')).exists()
      ).toBe(true);
    });

    it('shows the server message instead of the default copy', () => {
      query.data = gate('block', '9.9.9', 'Please update today.');
      const wrapper = mountBoundary();
      expect(wrapper.find(getByTestId('client-gate-message')).text()).toBe(
        'Please update today.'
      );
    });

    it('omits the required version when the server sends none', () => {
      query.data = gate('block', null);
      const wrapper = mountBoundary();
      expect(wrapper.find(getByTestId('client-gate-versions')).text()).toBe(
        `You are using version ${__APP_VERSION__}.`
      );
    });

    it('follows the dark-mode preference like the nav bar', () => {
      prefersDark.value = true;
      const wrapper = mountBoundary();
      expect(
        wrapper.find(getByTestId('force-update-banner')).classes()
      ).toContain('dark');
    });
  });
});
