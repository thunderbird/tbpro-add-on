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
const { refetchSpy, mockQueryData } = vi.hoisted(() => {
  return {
    refetchSpy: vi.fn(),
    mockQueryData: {
      value: {
        type: 'subtree',
        data: { id: 'test', name: 'Test Folder', items: [] },
        folders: [],
      },
    },
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
      visibleFolders: [],
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
});
