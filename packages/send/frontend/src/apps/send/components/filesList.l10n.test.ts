// German render check for the files list, folder navigation and the details
// panel (#1088 batch 2).
import { resetL10n, setLocale } from '@send-frontend/l10n';
import { DayJsKey } from '@send-frontend/types';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';

const { state, modalOptions } = vi.hoisted(() => ({
  state: {
    selectedFolder: null as Record<string, unknown> | null,
    selectedFile: null as Record<string, unknown> | null,
  },
  modalOptions: [] as { attrs?: { title?: string } }[],
}));

vi.mock('vue-final-modal', () => ({
  useModal: vi.fn((options) => {
    modalOptions.push(options);
    return { open: vi.fn(), close: vi.fn() };
  }),
  useModalSlot: vi.fn((slot) => slot),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, path: '/send/folder/f1' }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    currentRoute: ref({ path: '/send/folder/f1' }),
  }),
}));
vi.mock('@send-frontend/lib/queries/folderQueries', () => ({
  useFolderQuery: vi.fn(() => ({
    data: ref(null),
    isLoading: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  })),
}));
vi.mock('@send-frontend/apps/send/stores/folder-store', () => ({
  StaleContainerAccessError: class extends Error {},
  default: vi.fn(() => ({
    rootFolder: null,
    visibleFolders: [],
    get selectedFolder() {
      return state.selectedFolder;
    },
    get selectedFile() {
      return state.selectedFile;
    },
    getDefaultFolderId: vi.fn(),
  })),
}));
vi.mock('@send-frontend/apps/send/stores/sharing-store', () => ({
  default: () => ({
    links: [],
    fetchFileAccessLinks: vi.fn(),
    fetchFolderAccessLinks: vi.fn(),
  }),
}));
vi.mock('@send-frontend/apps/send/stores/status-store', () => ({
  useStatusStore: () => ({ isRouterLoading: ref(false), progress: {} }),
}));
vi.mock('@send-frontend/stores', () => ({
  useStatusStore: () => ({ isRouterLoading: ref(false), progress: {} }),
  useApiStore: () => ({ api: {} }),
  useKeychainStore: () => ({ keychain: { locked: false } }),
  useConfigStore: () => ({ isDev: true }),
}));
vi.mock('@send-frontend/lib/trpc', () => ({ trpc: {} }));
vi.mock('@tanstack/vue-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));

import FileNameForm from '../elements/FileNameForm.vue';
import FolderNameForm from '../elements/FolderNameForm.vue';
import FileInfo from './FileInfo.vue';
import FolderInfo from './FolderInfo.vue';
import FolderNavigation from './FolderNavigation.vue';
import FolderView from './FolderView.vue';
import NewFolder from './NewFolder.vue';

const slotStub = { template: '<div><slot /></div>' };

// A wrapper left mounted would re-render on the next test's setLocale().
enableAutoUnmount(afterEach);

describe('files list in German', () => {
  beforeEach(() => {
    resetL10n();
    modalOptions.length = 0;
    state.selectedFolder = {
      id: 'f1',
      name: 'Holiday',
      size: 0,
      createdAt: '2026-11-01',
      updatedAt: '2026-11-02',
    };
    state.selectedFile = {
      id: 1,
      name: 'notes.txt',
      uploadId: 'u1',
      createdAt: '2026-11-01',
      upload: { size: 10, reported: false, expired: false },
    };
  });

  it('FolderView: heading, empty state and delete dialog title', async () => {
    const wrapper = mount(FolderView, {
      global: {
        provide: { [DayJsKey as symbol]: () => ({ to: () => '' }) },
        stubs: { BreadCrumb: true, RouterLink: true },
      },
    });
    expect(wrapper.find('h2').text()).toBe('Your Files');
    expect(wrapper.text()).toContain('No files');
    await setLocale(['de']);
    await nextTick();
    expect(wrapper.find('h2').text()).toBe('Ihre Dateien');
    expect(wrapper.text()).toContain('Keine Dateien');
    // The modal title is a getter, so it follows the locale too.
    expect(modalOptions.at(-1)?.attrs?.title).toBe('Element löschen?');
  });

  it('FolderNavigation: side bar label and upload zone text', async () => {
    const wrapper = mount(FolderNavigation, {
      global: {
        stubs: { RenderOnEnvironment: slotStub, DragAndDropUpload: slotStub },
      },
    });
    const zone = wrapper.find('.upload-zone');
    expect(zone.text()).toBe('Drop files here\nor tap to upload');
    await setLocale(['de']);
    await nextTick();
    expect(wrapper.find('aside').attributes('aria-label')).toBe(
      'Seitenleiste der Dateiverwaltung'
    );
    expect(zone.attributes('aria-label')).toBe(
      'Dateien zum Hochladen hierher ziehen und ablegen oder klicken, um Dateien auszuwählen'
    );
    expect(zone.text()).toBe(
      'Dateien hier ablegen\noder tippen, um sie hochzuladen'
    );
  });

  it('FolderInfo: close label and dates', async () => {
    const wrapper = mount(FolderInfo, {
      global: {
        stubs: {
          CreateAccessLink: true,
          FolderAccessLinksList: true,
          FolderNameForm: true,
        },
      },
    });
    expect(wrapper.text()).toContain('Created');
    await setLocale(['de']);
    await nextTick();
    expect(wrapper.text()).toContain('Erstellt');
    expect(
      wrapper.find('[data-testid="close-folder-info"]').attributes('aria-label')
    ).toBe('Ordnerdetails schließen');
  });

  it('FileInfo: expiry choices and share button', async () => {
    const wrapper = mount(FileInfo, {
      global: {
        stubs: {
          NewAccessLink: true,
          FileAccessLinksList: true,
          FileNameForm: true,
        },
      },
    });
    const button = wrapper.find('[data-testid="create-share-link"]');
    expect(button.text()).toBe('Create Share Link');
    expect(wrapper.find('option[value="14days"]').text()).toBe(
      'Expire in 14 days (default)'
    );
    await setLocale(['de']);
    await nextTick();
    expect(button.text()).toBe('Freigabelink erstellen');
    expect(wrapper.find('option[value="14days"]').text()).toBe(
      'Läuft in 14 Tagen ab (Standard)'
    );
  });

  it('NewFolder: button', async () => {
    const wrapper = mount(NewFolder);
    const button = wrapper.find('[data-testid="new-folder-button"]');
    expect(button.text()).toBe('New Folder');
    await setLocale(['de']);
    await nextTick();
    expect(button.text()).toBe('Neuer Ordner');
  });

  it('FolderNameForm and FileNameForm: rename button', async () => {
    const folder = mount(FolderNameForm);
    const file = mount(FileNameForm);
    expect(folder.find('button').text()).toBe('Rename');
    expect(file.find('button').text()).toBe('Rename');
    await setLocale(['de']);
    await nextTick();
    expect(folder.find('button').text()).toBe('Umbenennen');
    expect(file.find('button').text()).toBe('Umbenennen');
  });
});
