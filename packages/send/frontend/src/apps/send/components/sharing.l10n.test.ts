// German render check for the share-link components (#1088 batch 2).
import { resetL10n, setLocale } from '@send-frontend/l10n';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

const { links } = vi.hoisted(() => ({
  links: [] as Record<string, unknown>[],
}));

vi.mock('@send-frontend/apps/send/stores/sharing-store', () => ({
  default: () => ({
    links,
    fetchFileAccessLinks: vi.fn(),
    fetchFolderAccessLinks: vi.fn(),
  }),
}));
vi.mock('@send-frontend/lib/trpc', () => ({ trpc: {} }));
vi.mock('@tanstack/vue-query', () => ({
  useMutation: () => ({ mutate: vi.fn() }),
}));

import CreateAccessLink from './CreateAccessLink.vue';
import FileAccessLinksList from './FileAccessLinksList.vue';
import FolderAccessLinksList from './FolderAccessLinksList.vue';
import NewAccessLink from './NewAccessLink.vue';

// A wrapper left mounted would re-render on the next test's setLocale().
enableAutoUnmount(afterEach);

const tooltip = { mounted: () => {}, updated: () => {} };

describe('share links in German', () => {
  beforeEach(() => {
    resetL10n();
    links.length = 0;
    links.push({ id: 'abc', hasPassword: true, locked: true });
  });

  it('CreateAccessLink: labels and button', async () => {
    const wrapper = mount(CreateAccessLink, { props: { folderId: 'f1' } });
    const button = wrapper.find('[data-testid="create-share-link"]');
    expect(button.text()).toBe('Create Access Link');
    expect(wrapper.find('option[value="custom"]').text()).toBe(
      'Custom date and time'
    );
    await setLocale(['de']);
    await nextTick();
    expect(button.text()).toBe('Zugriffslink erstellen');
    expect(wrapper.find('.label-text').text()).toBe('Ablauf des Links');
    expect(wrapper.find('option[value="custom"]').text()).toBe(
      'Eigenes Datum und eigene Uhrzeit'
    );
  });

  it('NewAccessLink: label, copy button and notice', async () => {
    const wrapper = mount(NewAccessLink, {
      props: { url: 'https://example.com/share/abc#k', hasPassword: false },
    });
    const copy = wrapper.find('[data-testid="copy-new-access-link"]');
    expect(copy.text()).toBe('Copy');
    await setLocale(['de']);
    await nextTick();
    expect(copy.text()).toBe('Kopieren');
    expect(wrapper.find('.label-text').text()).toBe('Ihr neuer Link');
    expect(
      wrapper.find('[data-testid="new-access-link-notice"]').text()
    ).toMatch(/^Dieser Link ist nur jetzt für Sie sichtbar/);
  });

  const global = { directives: { tooltip } };
  it.each([
    [
      'FileAccessLinksList',
      () => mount(FileAccessLinksList, { props: { uploadId: 'u1' }, global }),
    ],
    [
      'FolderAccessLinksList',
      () => mount(FolderAccessLinksList, { props: { folderId: 'f1' }, global }),
    ],
  ])('%s: heading and status tags', async (_name, mountList) => {
    const wrapper = mountList();
    const header = wrapper.find('[data-testid="existing-links-header"]');
    expect(header.text()).toBe('Existing Links');
    await setLocale(['de']);
    await nextTick();
    expect(header.text()).toBe('Vorhandene Links');
    expect(
      wrapper.find('[data-testid="link-0"]').attributes('aria-label')
    ).toBe('Freigabelink');
    expect(wrapper.text()).toContain('Gesperrt');
  });
});
