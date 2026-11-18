// German render check for the delete and report confirmations (#1088 batch 3).
import { resetL10n, setLocale } from '@send-frontend/l10n';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

vi.mock('@send-frontend/stores/api-store', () => ({
  default: () => ({ api: { call: vi.fn() } }),
}));
vi.mock('@send-frontend/stores/metrics', () => ({
  default: () => ({ metrics: { capture: vi.fn() } }),
}));

import DeleteConfirmation from './DeleteConfirmation.vue';
import ReportContent from './ReportContent.vue';

describe('confirmation strings', () => {
  enableAutoUnmount(afterEach);
  beforeEach(() => resetL10n());

  it('DeleteConfirmation keeps the name in bold inside the sentence', async () => {
    const wrapper = mount(DeleteConfirmation, {
      props: {
        closefn: vi.fn(),
        confirm: vi.fn(),
        itemName: 'a.txt',
        itemType: 'file',
      },
    });
    expect(wrapper.text()).toContain(
      'Are you sure you want to delete the file “a.txt”?'
    );
    expect(wrapper.text()).toContain('Yes, Delete');
    await setLocale(['de']);
    await nextTick();
    expect(wrapper.text()).toContain(
      'Möchten Sie die Datei „a.txt“ wirklich löschen?'
    );
    expect(wrapper.find('strong').text()).toBe('a.txt');
  });

  it('ReportContent', async () => {
    const wrapper = mount(ReportContent, {
      props: { uploadId: 'u1', containerId: 'c1' },
    });
    expect(wrapper.text()).toContain('Is this content harmful?');
    await setLocale(['de']);
    await nextTick();
    expect(wrapper.text()).toContain('Sind diese Inhalte schädlich?');
  });
});
