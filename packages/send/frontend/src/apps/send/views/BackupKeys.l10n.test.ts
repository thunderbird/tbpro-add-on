import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { resetL10n, setLocale } from '@send-frontend/l10n';
import { getByTestId } from '@send-frontend/lib/testUtils';
import BackupKeys from './BackupKeys.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@send-frontend/composables/useIsExtension', () => ({
  useIsExtension: () => ({
    isExtension: { value: false },
    isRunningInsideThunderbird: { value: false },
  }),
}));

describe('BackupKeys log-out label', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetL10n();
  });

  it('renders the Fluent string and follows the locale', async () => {
    const wrapper = mount(BackupKeys, {
      global: {
        stubs: { RenderOnEnvironment: { template: '<div><slot /></div>' } },
      },
    });
    const button = wrapper.find(getByTestId('log-out-button-overlay'));
    expect(button.text()).toBe('Log out');
    await setLocale(['de']);
    await nextTick();
    expect(button.text()).toBe('Abmelden');
  });
});
