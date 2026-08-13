import FolderView from '@send-frontend/apps/send/components/FolderView.vue';
import { routes } from '@send-frontend/apps/send/router';
import { DayJsKey } from '@send-frontend/types';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

let router;
let wrapper;

// Use a simpler approach without ref in the hoisted function
const { refetchSpy, openDeleteModalSpy, openDownloadModalSpy, mockQueryData } =
  vi.hoisted(() => {
    return {
      refetchSpy: vi.fn(),
      openDeleteModalSpy: vi.fn(),
      openDownloadModalSpy: vi.fn(),
      mockQueryData: {
        value: {
          type: 'subtree',
          data: { id: 'test', name: 'Test Folder', items: [] },
          folders: [],
        },
      },
    };
  });

// Only the delete modal is registered with a title, so that discriminates the
// two useModal() calls without depending on the order they run in.
vi.mock('vue-final-modal', () => {
  return {
    useModal: vi.fn((options) => ({
      open:
        options?.attrs?.title === 'Delete Item?'
          ? openDeleteModalSpy
          : openDownloadModalSpy,
      close: vi.fn(),
    })),
    useModalSlot: vi.fn((slot) => slot),
  };
});

// Mock the folder queries
vi.mock('@send-frontend/lib/queries/folderQueries', () => {
  return {
    useFolderQuery: vi.fn(() => ({
      data: ref(mockQueryData.value),
      isLoading: ref(false),
      isError: ref(false),
      error: ref(null),
      isSuccess: ref(true),
      refetch: refetchSpy,
    })),
  };
});

// Setup testing environment
vi.mock('@send-frontend/apps/send/stores/folder-store', () => {
  return {
    esmodule: true,
    default: vi.fn(() => ({
      rootFolder: { items: [], id: 'test', name: 'Test Folder' },
      visibleFolders: [
        { id: 'folder-1', name: 'Folder One', updatedAt: '2026-01-01' },
      ],
      selectedFolder: null,
      selectedFile: null,
      setSelectedFile: vi.fn(),
      setSelectedFolder: vi.fn(),
    })),
  };
});

vi.mock('@send-frontend/stores/api-store', () => {
  return {
    esmodule: true,
    default: vi.fn(() => ({
      api: {
        // Mock API methods as needed
      },
    })),
  };
});

vi.mock('@send-frontend/stores/keychain-store', () => {
  return {
    esmodule: true,
    default: vi.fn(() => ({
      keychain: {
        // Mock keychain methods as needed
      },
    })),
  };
});

vi.mock('@send-frontend/apps/send/stores/status-store', () => {
  return {
    useStatusStore: vi.fn(() => ({
      isRouterLoading: ref(false),
      progress: {},
    })),
  };
});
vi.useFakeTimers();

describe('FolderView', () => {
  beforeEach(() => {
    // Set up Pinia
    const pinia = createPinia();
    setActivePinia(pinia);

    router = createRouter({
      history: createWebHistory(),
      routes,
    });

    wrapper = mount(FolderView, {
      global: {
        plugins: [router, pinia],
        provide: {
          //@ts-ignore
          [DayJsKey]: () => ({ to: () => 'a while ago' }),
        },
      },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly and reacts to route changes', async () => {
    expect(wrapper.text()).toContain('Your Files');

    // Trigger route change
    await router.push({ name: 'folder', params: { id: '0' } });
    await wrapper.vm.$nextTick();

    // Advance timers for debounced functions
    // This is VERY IMPORTANT to make sure the debounced function is called
    vi.runAllTimers();

    // Check if query refetch was called (which is the new cached approach)
    expect(refetchSpy).toHaveBeenCalled();

    await router.push({ name: 'folder', params: { id: '123' } });
    await wrapper.vm.$nextTick();
    vi.runAllTimers();

    // Should have been called again for the new route
    expect(refetchSpy).toHaveBeenCalledTimes(2);
  });

  // Regression: selecting a row mounts the 16rem details sidebar, which reflows
  // the table under the cursor, so the second click of a double click can land
  // on the delete button that just slid into place (#903).
  describe('folder row delete button', () => {
    const deleteButton = () =>
      wrapper.find('[data-testid="folder-row"] button.danger');

    it('ignores a click that is part of a multi-click sequence', async () => {
      await deleteButton().trigger('click', { detail: 2 });

      expect(openDeleteModalSpy).not.toHaveBeenCalled();
    });

    it('opens the confirmation for a deliberate single click', async () => {
      await deleteButton().trigger('click', { detail: 1 });

      expect(openDeleteModalSpy).toHaveBeenCalledOnce();
    });
  });
});
