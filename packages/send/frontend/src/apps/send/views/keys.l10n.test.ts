// German render check for the encryption key views (#1088 batch 3).
// BackupKeys keeps its own BackupKeys.l10n.test.ts.
import { resetL10n, setLocale } from '@send-frontend/l10n';
import { parsePassphrase } from '@send-frontend/lib/passphraseUtils';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@send-frontend/stores', () => ({
  useKeychainStore: () => ({ keychain: { getPassphraseValue: () => 'a b' } }),
  useUserStore: () => ({ user: { email: 'a@example.test' } }),
}));
vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: () => ({ keychain: { locked: true } }),
}));
vi.mock('@send-frontend/lib/storage', () => ({ Storage: class {} }));

import PassphraseChanged from '../pages/PassphraseChanged.vue';
import AccessLocked from './AccessLocked.vue';
import ManageEncryptionKeys from './ManageEncryptionKeys.vue';
import ManageKeys from './ManageKeys.vue';
import PassphraseField from './PassphraseField.vue';
import ResetKeyModal from './ResetKeyModal.vue';
import RestoreKeys from './RestoreKeys.vue';
import SecurityAndPrivacyV2 from './SecurityAndPrivacyV2.vue';

const stubs = {
  DangerButton: { template: '<button><slot /></button>' },
  PrimaryButton: { template: '<button><slot /></button>' },
  NoticeBar: { template: '<div><slot /></div>' },
  RouterLink: { template: '<a><slot /></a>' },
  SupportBox: true,
};

async function toGerman() {
  await setLocale(['de']);
  await nextTick();
}

describe('encryption key strings', () => {
  enableAutoUnmount(afterEach);
  beforeEach(() => resetL10n());

  it('RestoreKeys', async () => {
    const wrapper = mount(RestoreKeys, {
      props: { restoreFromBackup: vi.fn(), setPassphrase: vi.fn() },
    });
    const title = wrapper.find('h2');
    expect(title.text()).toBe('Recover Access with Your Encryption Key');
    await toGerman();
    expect(title.text()).toBe(
      'Zugang mit Ihrem Verschlüsselungsschlüssel wiederherstellen'
    );
  });

  it('ManageKeys', async () => {
    const wrapper = mount(ManageKeys, { global: { stubs } });
    const show = wrapper.find('button[aria-label]');
    expect(show.attributes('aria-label')).toBe('Show key');
    await toGerman();
    expect(show.attributes('aria-label')).toBe('Schlüssel anzeigen');
  });

  it('ManageEncryptionKeys', async () => {
    const wrapper = mount(ManageEncryptionKeys, { global: { stubs } });
    expect(wrapper.text()).toContain('Delete Send data');
    await toGerman();
    expect(wrapper.text()).toContain('Send-Daten löschen');
  });

  it('SecurityAndPrivacyV2', async () => {
    const wrapper = mount(SecurityAndPrivacyV2, {
      props: { onRecover: vi.fn() },
    });
    expect(wrapper.find('h1').text()).toBe('Security & Privacy');
    await toGerman();
    expect(wrapper.find('h1').text()).toBe('Sicherheit & Datenschutz');
  });

  it('AccessLocked', async () => {
    const wrapper = mount(AccessLocked, {
      props: { onRecover: vi.fn() },
      global: { stubs },
    });
    expect(wrapper.text()).toContain('Recover Access');
    await toGerman();
    expect(wrapper.text()).toContain('Zugang wiederherstellen');
  });

  it('PassphraseField default label and tooltips', async () => {
    const wrapper = mount(PassphraseField, {
      props: { regeneratePassphrase: vi.fn(), inputTestId: 'k' },
    });
    expect(wrapper.find('label').text()).toBe('Encryption Key *');
    await toGerman();
    expect(wrapper.find('label').text()).toBe('Verschlüsselungsschlüssel *');
    expect(wrapper.find('button[title="Kopieren"]').exists()).toBe(true);
  });

  it('ResetKeyModal keeps the button name in bold inside the sentence', async () => {
    const wrapper = mount(ResetKeyModal, {
      props: { words: ['a'], regeneratePassphrase: vi.fn() },
      global: { stubs },
    });
    await flushPromises();
    await toGerman();
    expect(wrapper.find('#title').text()).toBe(
      'Verschlüsselungsschlüssel zurücksetzen'
    );
    expect(wrapper.find('.description strong').text()).toBe(
      'Schlüssel herunterladen und zurücksetzen'
    );
  });

  it('PassphraseChanged', async () => {
    const wrapper = mount(PassphraseChanged, { global: { stubs } });
    expect(wrapper.find('h2').text()).toBe('Warning');
    await toGerman();
    expect(wrapper.find('h2').text()).toBe('Warnung');
  });

  it('parsePassphrase word-count error follows the locale', async () => {
    expect(() => parsePassphrase('a b')).toThrow('Expected 6 words, got 2');
    await setLocale(['de']);
    expect(() => parsePassphrase('a b')).toThrow(
      '6 Wörter erwartet, 2 erhalten'
    );
  });
});
