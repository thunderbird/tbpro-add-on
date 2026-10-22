import { getByTestId } from '@send-frontend/lib/testUtils';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import CompatibilityBanner from './CompatibilityBanner.vue';

const { query, config } = vi.hoisted(() => ({
  query: { data: null as unknown },
  config: { isProd: true, isTbproExtension: false },
}));

vi.mock('@send-frontend/lib/trpc', () => ({
  trpc: { settings: { query: vi.fn() } },
}));
vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => ({ data: ref(query.data), error: ref(null) }),
}));
vi.mock('../send/stores/config-store', () => ({
  useConfigStore: () => config,
}));
vi.mock('@vueuse/core', () => ({ usePreferredDark: () => ref(false) }));

function gate(
  action: string,
  message: unknown = null,
  title: unknown = 'Server title'
) {
  return { clientGate: { action, minVersion: '9.9.9', title, message } };
}

describe('CompatibilityBanner', () => {
  beforeEach(() => {
    query.data = null;
    config.isProd = true;
    config.isTbproExtension = false;
  });

  it('renders nothing while settings are loading', () => {
    const wrapper = mount(CompatibilityBanner);
    expect(wrapper.find('header').exists()).toBe(false);
  });

  it.each(['none', 'block'])('renders nothing for %s', (action) => {
    query.data = gate(action);
    const wrapper = mount(CompatibilityBanner);
    expect(wrapper.find(getByTestId('prompt-update-banner')).exists()).toBe(
      false
    );
  });

  it('shows the update notice for banner with default copy', () => {
    query.data = gate('banner');
    const wrapper = mount(CompatibilityBanner);
    expect(wrapper.find(getByTestId('prompt-update-message')).text()).toBe(
      'A new version of Send is available. Reload the page to get it.'
    );
  });

  it('uses add-on copy in the add-on', () => {
    config.isTbproExtension = true;
    query.data = gate('banner');
    const wrapper = mount(CompatibilityBanner);
    expect(wrapper.find(getByTestId('prompt-update-message')).text()).toContain(
      'Update Thunderbird and its add-ons'
    );
  });

  it('shows the server message', () => {
    query.data = gate('banner', 'Version 3 is out.');
    const wrapper = mount(CompatibilityBanner);
    expect(wrapper.find(getByTestId('prompt-update-message')).text()).toBe(
      'Version 3 is out.'
    );
  });

  it('falls back to the default copy for a non-string message', () => {
    query.data = gate('banner', ['Version 3 is out.']);
    const wrapper = mount(CompatibilityBanner);
    expect(wrapper.find(getByTestId('prompt-update-message')).text()).toBe(
      'A new version of Send is available. Reload the page to get it.'
    );
  });

  it('can be dismissed', async () => {
    query.data = gate('banner');
    const wrapper = mount(CompatibilityBanner);
    await wrapper.find(getByTestId('prompt-update-close')).trigger('click');
    expect(wrapper.find(getByTestId('prompt-update-banner')).exists()).toBe(
      false
    );
  });

  it('shows the testing banner outside production', () => {
    config.isProd = false;
    const wrapper = mount(CompatibilityBanner);
    expect(wrapper.find(getByTestId('testing-banner')).exists()).toBe(true);
  });

  it('dismisses the testing banner without hiding an update notice', async () => {
    config.isProd = false;
    query.data = gate('banner');
    const wrapper = mount(CompatibilityBanner);

    await wrapper
      .find(`${getByTestId('testing-banner')} ${getByTestId('close-button')}`)
      .trigger('click');

    expect(wrapper.find(getByTestId('testing-banner')).exists()).toBe(false);
    expect(wrapper.find(getByTestId('prompt-update-banner')).exists()).toBe(
      true
    );
  });
});
