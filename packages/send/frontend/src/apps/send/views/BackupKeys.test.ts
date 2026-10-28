import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import BackupKeys from './BackupKeys.vue';

// The overlay must show save/swap errors so the phrase stays on screen (#1355).

vi.mock('@send-frontend/stores', () => ({
  useConfigStore: () => ({ isExtension: false }),
  useStatusStore: () => ({ validators: vi.fn() }),
  useUserStore: () => ({ clearUserFromStorage: vi.fn() }),
}));

vi.mock('@send-frontend/composables/useSendConfig', () => ({
  useSendConfig: () => ({ queryAddonLoginState: vi.fn() }),
  isKnownSignedOut: () => false,
}));

vi.mock('@send-frontend/composables/useIsExtension', () => ({
  useIsExtension: () => ({ isRunningInsideThunderbird: ref(false) }),
}));

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const mountOverlay = (
  errorMessage: string,
  props: Record<string, unknown> = {}
) =>
  mount(BackupKeys, {
    props: {
      words: ['one', 'two'],
      makeBackup: vi.fn(),
      regeneratePassphrase: vi.fn(),
      logOutAuth: vi.fn(),
      errorMessage,
      ...props,
    },
    global: { stubs: { RenderOnEnvironment: true, KeysTemplate: false } },
  });

describe('BackupKeys.vue', () => {
  it('shows the error next to the phrase', () => {
    const wrapper = mountOverlay('Could not reset your encryption key: 422');

    expect(
      wrapper.find('[data-testid="backup-keys-error-overlay"]').text()
    ).toBe('Could not reset your encryption key: 422');
    expect(
      (
        wrapper.find('[data-testid="backup-keys-passphrase-input-overlay"]')
          .element as HTMLInputElement
      ).value
    ).toBe('one - two');
  });

  it('first-time setup: regenerate and Download and Continue still work', async () => {
    const regeneratePassphrase = vi.fn();
    const makeBackup = vi.fn();
    const wrapper = mountOverlay('', { regeneratePassphrase, makeBackup });

    await wrapper.find('button[title="Regenerate"]').trigger('click');
    await wrapper
      .find('[data-testid="encrypt-keys-button-overlay"]')
      .trigger('click');

    expect(regeneratePassphrase).toHaveBeenCalledTimes(1);
    expect(makeBackup).toHaveBeenCalledTimes(1);
    expect(
      wrapper.find('[data-testid="backup-keys-error-overlay"]').exists()
    ).toBe(false);
  });

  it('disables regenerate when the phrase is locked', () => {
    const wrapper = mountOverlay('', { canRegenerate: false });

    expect(
      wrapper.find('button[title="Regenerate"]').attributes('disabled')
    ).toBeDefined();
  });
});
