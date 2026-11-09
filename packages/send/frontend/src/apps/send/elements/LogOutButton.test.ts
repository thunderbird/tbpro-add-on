import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetL10n, setLocale } from '@send-frontend/l10n';
import LogOutButton from './LogOutButton.vue';

describe('LogOutButton', () => {
  beforeEach(() => resetL10n());

  it('renders English by default', () => {
    const wrapper = mount(LogOutButton, { props: { logOut: async () => {} } });
    expect(wrapper.text()).toBe('Log out');
  });

  it('re-renders when the locale changes', async () => {
    const wrapper = mount(LogOutButton, { props: { logOut: async () => {} } });
    await setLocale(['de']);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe('Abmelden');
  });
});
