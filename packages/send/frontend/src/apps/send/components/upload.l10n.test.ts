// German render check for the upload components (#1088 batch 1).
import { resetL10n, setLocale } from '@send-frontend/l10n';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, ref } from 'vue';

const { progress } = vi.hoisted(() => ({
  progress: {} as Record<string, unknown>,
}));

function resetProgress() {
  Object.assign(progress, {
    error: '',
    text: '',
    fileName: '',
    processStage: 'idle',
    percentage: 0,
    total: 0,
    progressed: 0,
    initialize: vi.fn(),
  });
}

vi.mock('../stores/status-store', () => ({
  useStatusStore: () => ({ progress: reactiveProgress() }),
}));
vi.mock('@send-frontend/stores', () => ({
  useStatusStore: () => ({ progress: reactiveProgress() }),
}));
vi.mock('@send-frontend/apps/send/stores/folder-store', () => ({
  default: () => ({ rootFolder: { id: 'root' }, uploadItem: vi.fn() }),
}));
vi.mock('@send-frontend/stores/api-store', () => ({
  default: () => ({ api: {} }),
}));
vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => ({ error: ref(null) }),
}));

let shared: Record<string, unknown> | null = null;
function reactiveProgress() {
  shared ??= reactive(progress);
  return shared;
}

import DragAndDropUpload from './DragAndDropUpload.vue';
import ErrorUploading from './ErrorUploading.vue';
import ProgressBarV2 from './ProgressBarV2.vue';
import UploadingProgress from './UploadingProgress.vue';

describe('upload components in German', () => {
  beforeEach(() => {
    resetL10n();
    resetProgress();
    shared = null;
  });

  it('DragAndDropUpload: drop zone copy', async () => {
    const wrapper = mount(DragAndDropUpload);
    const zone = wrapper.find('[data-testid="drop-zone"]');
    expect(zone.text()).toBe('Drop files here or tap to upload');
    await setLocale(['de']);
    await nextTick();
    expect(zone.text()).toBe(
      'Dateien hier ablegen oder tippen, um sie hochzuladen'
    );
    expect(zone.attributes('aria-label')).toBe(
      'Dateien hier ablegen oder klicken, um Dateien zum Hochladen auszuwählen'
    );
  });

  it('ErrorUploading: fallback error', async () => {
    const wrapper = mount(ErrorUploading);
    expect(wrapper.text()).toBe(
      'There was an error uploading your file, please try again or raise an issue'
    );
    await setLocale(['de']);
    await nextTick();
    expect(wrapper.text()).toBe(
      'Beim Hochladen Ihrer Datei ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut oder melden Sie das Problem.'
    );
  });

  it('ProgressBarV2: stage tag and status label', async () => {
    Object.assign(progress, {
      fileName: 'a.txt',
      processStage: 'encrypting',
      percentage: 40,
    });
    const wrapper = mount(ProgressBarV2);
    expect(wrapper.text()).toContain('Encrypting...');
    expect(wrapper.attributes('aria-label')).toBe(
      'Processing a.txt: Encrypting..., 40% complete'
    );
    await setLocale(['de']);
    await nextTick();
    expect(wrapper.text()).toContain('Wird verschlüsselt…');
    expect(wrapper.attributes('aria-label')).toBe(
      'a.txt wird verarbeitet: Wird verschlüsselt…, 40 % abgeschlossen'
    );
  });

  it('UploadingProgress', async () => {
    const wrapper = mount(UploadingProgress);
    expect(wrapper.find('p').text()).toBe('Uploading...');
    await setLocale(['de']);
    await nextTick();
    expect(wrapper.find('p').text()).toBe('Wird hochgeladen…');
  });
});
