import { FORCE_CLOSE_WINDOW } from '@send-frontend/lib/const';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref, type Ref } from 'vue';
import SecurityAndPrivacyPage from './SecurityAndPrivacyPage.vue';

const { state } = vi.hoisted(() => ({
  state: {
    query: {} as Record<string, string>,
    filesDeleted: false,
    // Assigned by the useBackupAndRestore mock below so tests can flip it.
    keysInLocalStorage: null as unknown as Ref<boolean>,
  },
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: state.query }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: () => ({ keychain: { getPassphraseValue: () => 'stored' } }),
}));

vi.mock('@send-frontend/apps/send/composables/useBackupAndRestore', () => {
  state.keysInLocalStorage = ref(false);
  return {
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
      keysInLocalStorage: state.keysInLocalStorage,
    }),
  };
});

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
  // Components watch the shared keysInLocalStorage ref, so unmount between tests
  // to stop a prior test's watcher from firing on the next test's ref changes.
  enableAutoUnmount(afterEach);

  beforeEach(() => {
    state.query = {};
    state.filesDeleted = false;
    state.keysInLocalStorage.value = false;
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

  it('closes the window once keys are stored when opened with ?closeOnComplete=true', async () => {
    state.query = { closeOnComplete: 'true' };
    const postMessage = vi
      .spyOn(window, 'postMessage')
      .mockImplementation(() => {});
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});

    mountPage();

    // Nothing happens until the keys actually land in local storage.
    expect(postMessage).not.toHaveBeenCalled();

    state.keysInLocalStorage.value = true;
    await nextTick();

    expect(postMessage).toHaveBeenCalledWith(
      { type: FORCE_CLOSE_WINDOW },
      window.location.origin
    );
    expect(close).toHaveBeenCalled();
  });

  it('does not close the window when the closeOnComplete flag is absent', async () => {
    const postMessage = vi
      .spyOn(window, 'postMessage')
      .mockImplementation(() => {});
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});

    mountPage();

    state.keysInLocalStorage.value = true;
    await nextTick();

    expect(postMessage).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
