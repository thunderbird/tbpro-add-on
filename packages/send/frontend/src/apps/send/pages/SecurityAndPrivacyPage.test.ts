import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SecurityAndPrivacyPage from './SecurityAndPrivacyPage.vue';

const { state } = vi.hoisted(() => ({
  state: {
    query: {} as Record<string, string>,
    filesDeleted: false,
  },
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: state.query }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: () => ({ keychain: { getPassphraseValue: () => 'stored' } }),
}));

vi.mock('@send-frontend/apps/send/composables/useBackupAndRestore', () => ({
  useBackupAndRestore: () => ({
    backupData: 'KEYS_IN_LOCAL_STORAGE',
    errorMessage: '',
    setPassphrase: vi.fn(),
    restoreFromBackup: vi.fn(),
    shouldReset: false,
    resetKeys: vi.fn(),
    deleteFiles: vi.fn(),
    filesDeleted: state.filesDeleted,
    deleteFailed: false,
    resetDeleteFiles: vi.fn(),
  }),
}));

const stubs = {
  DeleteSendDataCard: true,
  DeleteSendDataSuccessCard: true,
  RestoreKeys: true,
  ResetEncryptionKeyV2: true,
  SecurityAndPrivacy: true,
  SupportBox: true,
};

const mountPage = () => mount(SecurityAndPrivacyPage, { global: { stubs } });

describe('SecurityAndPrivacyPage.vue', () => {
  beforeEach(() => {
    state.query = {};
    state.filesDeleted = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the delete form when ?delete=true and nothing has been deleted', () => {
    state.query = { delete: 'true' };

    const wrapper = mountPage();

    expect(wrapper.findComponent({ name: 'DeleteSendDataCard' }).exists()).toBe(
      true
    );
    expect(
      wrapper.findComponent({ name: 'DeleteSendDataSuccessCard' }).exists()
    ).toBe(false);
  });

  it('shows the confirmation screen once files have been deleted', () => {
    state.query = { delete: 'true' };
    state.filesDeleted = true;

    const wrapper = mountPage();

    expect(
      wrapper.findComponent({ name: 'DeleteSendDataSuccessCard' }).exists()
    ).toBe(true);
    expect(wrapper.findComponent({ name: 'DeleteSendDataCard' }).exists()).toBe(
      false
    );
  });

  it('shows neither delete card without the delete query flag', () => {
    const wrapper = mountPage();

    expect(wrapper.findComponent({ name: 'DeleteSendDataCard' }).exists()).toBe(
      false
    );
    expect(
      wrapper.findComponent({ name: 'DeleteSendDataSuccessCard' }).exists()
    ).toBe(false);
  });
});
