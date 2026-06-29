import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileView from './ProfileView.vue';

const { isThunderbirdHost, environmentType, push } = vi.hoisted(() => {
  return { isThunderbirdHost: vi.fn(), environmentType: vi.fn(), push: vi.fn() };
});

// Run debounced callbacks synchronously so we can assert without timers.
vi.mock('@vueuse/core', () => ({
  useDebounceFn: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@send-frontend/stores', () => ({
  useConfigStore: () => ({
    get isThunderbirdHost() {
      return isThunderbirdHost();
    },
  }),
}));

vi.mock('@send-frontend/composables/useIsExtension', () => ({
  useIsExtension: () => ({
    environmentType: { value: environmentType() },
  }),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

const stubs = {
  UserDashboard: true,
  LoadingComponent: true,
};

function setSearch(search: string) {
  Object.defineProperty(window, 'location', {
    value: { search },
    writable: true,
  });
}

describe('ProfileView.vue', () => {
  beforeEach(() => {
    window.close = vi.fn();
    setSearch('');
    isThunderbirdHost.mockReturnValue(false);
    environmentType.mockReturnValue('WEB APP OUTSIDE THUNDERBIRD');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the dashboard for the web app outside Thunderbird', () => {
    environmentType.mockReturnValue('WEB APP OUTSIDE THUNDERBIRD');
    isThunderbirdHost.mockReturnValue(false);

    const wrapper = mount(ProfileView, { global: { stubs } });

    expect(wrapper.findComponent({ name: 'UserDashboard' }).exists()).toBe(true);
    expect(window.close).not.toHaveBeenCalled();
  });

  it('shows the dashboard when ?showDashboard=true is present inside Thunderbird', () => {
    environmentType.mockReturnValue('WEB APP INSIDE THUNDERBIRD');
    isThunderbirdHost.mockReturnValue(true);
    setSearch('?showDashboard=true');

    const wrapper = mount(ProfileView, { global: { stubs } });

    expect(wrapper.findComponent({ name: 'UserDashboard' }).exists()).toBe(true);
    expect(window.close).not.toHaveBeenCalled();
  });

  it('shows the dashboard for a genuine web-app tab inside Thunderbird (e.g. opened from accounts dashboard)', () => {
    // Regression test for bugzilla #2051092: the accounts.tb.pro Send link
    // navigates here without ?showDashboard=true and the page used to
    // self-close instead of rendering the dashboard.
    environmentType.mockReturnValue('WEB APP INSIDE THUNDERBIRD');
    isThunderbirdHost.mockReturnValue(true);
    setSearch('');

    const wrapper = mount(ProfileView, { global: { stubs } });

    expect(wrapper.findComponent({ name: 'UserDashboard' }).exists()).toBe(true);
    expect(window.close).not.toHaveBeenCalled();
  });

  it('auto-closes the post-login extension popup (isExtension=true)', () => {
    environmentType.mockReturnValue('WEB APP INSIDE THUNDERBIRD');
    isThunderbirdHost.mockReturnValue(true);
    setSearch('?isExtension=true');

    const wrapper = mount(ProfileView, { global: { stubs } });

    expect(wrapper.findComponent({ name: 'UserDashboard' }).exists()).toBe(
      false
    );
    expect(window.close).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/close');
  });
});
