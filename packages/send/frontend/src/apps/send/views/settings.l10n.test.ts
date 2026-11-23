// German render check for the settings page, storage, support and the
// delete-data cards (#1088 batch 3).
import { resetL10n, setLocale } from '@send-frontend/l10n';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: () => ({ keychain: { getPassphraseValue: () => 'stored' } }),
}));
vi.mock('@send-frontend/apps/send/composables/useBackupAndRestore', () => ({
  useBackupAndRestore: () => ({
    backupData: 'KEYS_IN_LOCAL_STORAGE',
    shouldReset: false,
    keysInLocalStorage: ref(false),
    cancelReset: vi.fn(),
    beginReset: vi.fn(),
  }),
}));
vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => ({
    data: ref({ active: 2_000_000_000, limit: 20_000_000_000 }),
    error: ref(null),
    isLoading: ref(false),
  }),
}));
vi.mock('@send-frontend/lib/trpc', () => ({ trpc: {} }));
vi.mock('@send-frontend/stores', () => ({
  useApiStore: () => ({ api: { call: vi.fn().mockResolvedValue([]) } }),
}));

import DeleteDataPage from '../pages/DeleteDataPage.vue';
import SettingsPage from '../pages/SettingsPage.vue';
import DeleteSendDataCard from './DeleteSendDataCard.vue';
import DeleteSendDataSuccessCard from './DeleteSendDataSuccessCard.vue';
import StorageBar from './StorageBar.vue';
import SupportBox from './SupportBox.vue';

const stubs = {
  DangerButton: { template: '<button><slot /></button>' },
  BaseButton: { template: '<button><slot /></button>' },
  ProgressBarDashboard: true,
  SecurityAndPrivacy: true,
  SupportBox: true,
};

async function toGerman() {
  await setLocale(['de']);
  await nextTick();
}

describe('settings strings', () => {
  enableAutoUnmount(afterEach);
  beforeEach(() => resetL10n());

  it('SettingsPage', async () => {
    const wrapper = mount(SettingsPage, { global: { stubs } });
    expect(wrapper.find('h1').text()).toBe('Settings');
    await toGerman();
    expect(wrapper.find('h1').text()).toBe('Einstellungen');
  });

  it('StorageBar', async () => {
    const wrapper = mount(StorageBar, { global: { stubs } });
    expect(wrapper.text()).toContain('2 GB of 20 GB');
    await toGerman();
    expect(wrapper.text()).toContain('2 GB von 20 GB');
  });

  it('SupportBox', async () => {
    const wrapper = mount(SupportBox);
    expect(wrapper.text()).toContain('Need Support?');
    await toGerman();
    expect(wrapper.text()).toContain('Brauchen Sie Hilfe?');
  });

  it('DeleteSendDataCard', async () => {
    const wrapper = mount(DeleteSendDataCard, {
      props: { storedPassphrase: 'a b c d e f' },
      global: { stubs },
    });
    const input = wrapper.find('[data-testid="delete-password"]');
    expect(input.attributes('placeholder')).toBe('Your passphrase goes here');
    await toGerman();
    expect(input.attributes('placeholder')).toBe(
      'Ihre Passphrase hier eingeben'
    );
  });

  it('DeleteSendDataSuccessCard', async () => {
    const wrapper = mount(DeleteSendDataSuccessCard, { global: { stubs } });
    expect(wrapper.find('h1').text()).toBe('Your Send data has been deleted');
    await toGerman();
    expect(wrapper.find('h1').text()).toBe('Ihre Send-Daten wurden gelöscht');
  });

  it('DeleteDataPage', async () => {
    const wrapper = mount(DeleteDataPage);
    await flushPromises();
    expect(wrapper.text()).toContain('No users found.');
    await toGerman();
    expect(wrapper.text()).toContain('Keine Benutzer gefunden.');
  });
});
