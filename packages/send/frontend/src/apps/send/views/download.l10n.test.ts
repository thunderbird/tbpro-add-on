// German render check for the share-link page, the download dialog and the
// dashboard cards (#1088 batch 2).
import { resetL10n, setLocale } from '@send-frontend/l10n';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';

const { sharing } = vi.hoisted(() => ({
  sharing: { isAccessLinkValid: vi.fn(), acceptAccessLink: vi.fn() },
}));

vi.mock('@send-frontend/apps/send/stores/sharing-store', () => ({
  default: () => sharing,
}));
vi.mock('@send-frontend/lib/validations', () => ({
  getCanRetry: vi.fn(async () => true),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { linkId: 'link-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('../composables/useBackupAndRestore', () => ({
  useBackupAndRestore: () => ({ backupData: ref(null) }),
}));
vi.mock('../composables/useNavigation', () => ({
  useNavigation: () => ({ filesLink: { path: '/send' } }),
}));

import DownloadConfirmation from '../components/DownloadConfirmation.vue';
import AcceptAccessLink from './AcceptAccessLink.vue';
import DownloadInfo from './DownloadInfo.vue';
import DownloadTemplate from './DownloadTemplate.vue';
import ManageFiles from './ManageFiles.vue';
import SendAddonDashboard from './SendAddonDashboard.vue';

// A wrapper left mounted would re-render on the next test's setLocale().
enableAutoUnmount(afterEach);

describe('download pages in German', () => {
  beforeEach(() => {
    resetL10n();
    window.location.hash = '';
  });

  it('DownloadTemplate: heading', async () => {
    const wrapper = mount(DownloadTemplate);
    expect(wrapper.find('h1').text()).toBe(
      'Your file is ready to download securely'
    );
    await setLocale(['de']);
    await nextTick();
    expect(wrapper.find('h1').text()).toBe(
      'Ihre Datei kann sicher heruntergeladen werden'
    );
  });

  it('AcceptAccessLink: form and attempts left', async () => {
    sharing.isAccessLinkValid.mockResolvedValue({ id: 'link-1' });
    sharing.acceptAccessLink.mockResolvedValue({
      status: 'incorrect',
      attemptsRemaining: 2,
    });
    const wrapper = mount(AcceptAccessLink);
    expect(wrapper.find('h3').text()).toBe('This file is password protected');
    await setLocale(['de']);
    await nextTick();
    expect(wrapper.find('h3').text()).toBe('Diese Datei ist passwortgeschützt');
    expect(wrapper.find('[data-testid="submit-button"]').text()).toBe('Weiter');
    await wrapper.get('[data-testid="password-input"]').setValue('guess');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[data-testid="access-link-error"]').text()).toContain(
      'Dieses Passwort ist falsch'
    );
    expect(wrapper.get('[data-testid="attempts-remaining"]').text()).toBe(
      'Noch 2 Versuche.'
    );
  });

  it('DownloadInfo: file details and fallback names', async () => {
    const wrapper = mount(DownloadInfo, {
      props: { handleDownload: vi.fn(), id: 'u1', containerId: 'c1' },
      global: { stubs: { ReportContent: true } },
    });
    const button = wrapper.find('[data-testid="download-button-0"]');
    expect(button.text()).toBe('Download');
    expect(wrapper.text()).toContain('Unknown file');
    await setLocale(['de']);
    await nextTick();
    expect(button.text()).toBe('Herunterladen');
    expect(wrapper.find('h2').text()).toBe('DATEIINFORMATIONEN');
    expect(wrapper.text()).toContain('Unbekannte Datei');
  });

  it('DownloadConfirmation: dialog', async () => {
    const wrapper = mount(DownloadConfirmation, {
      props: { closefn: vi.fn(), confirm: vi.fn() },
    });
    expect(wrapper.find('h2').text()).toBe('Before you download');
    await setLocale(['de']);
    await nextTick();
    expect(wrapper.find('h2').text()).toBe('Bevor Sie herunterladen');
    expect(wrapper.find('[data-testid="confirm-download"]').text()).toBe(
      'Herunterladen'
    );
    expect(wrapper.text()).toContain(
      'Sie laden gleich eine Datei über Thunderbird Send herunter.'
    );
  });

  it('ManageFiles and SendAddonDashboard: cards', async () => {
    const manage = mount(ManageFiles, {
      global: { stubs: { KeysTemplate: { template: '<div><slot /></div>' } } },
    });
    const addon = mount(SendAddonDashboard);
    expect(manage.find('h2').text()).toBe('Manage Files');
    expect(addon.find('button').text()).toBe('Open Dashboard');
    await setLocale(['de']);
    await nextTick();
    expect(manage.find('h2').text()).toBe('Dateien verwalten');
    expect(manage.find('button').text()).toBe('Auf Ihre Dateien zugreifen');
    expect(addon.find('button').text()).toBe('Dashboard öffnen');
  });
});
