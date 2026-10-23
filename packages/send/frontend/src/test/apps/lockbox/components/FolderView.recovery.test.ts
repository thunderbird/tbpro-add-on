import FolderView from '@send-frontend/apps/send/components/FolderView.vue';
import { routes } from '@send-frontend/apps/send/router';
import { DayJsKey } from '@send-frontend/types';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

// #1354: an unlocked 403/404 on the open folder moves to the default folder.
const { queryData, keychain, getDefaultFolderId } = vi.hoisted(() => ({
  queryData: { value: null as unknown },
  keychain: { locked: false },
  getDefaultFolderId: vi.fn(),
}));

vi.mock('vue-final-modal', () => ({
  useModal: vi.fn(() => ({ open: vi.fn(), close: vi.fn() })),
  useModalSlot: vi.fn((slot) => slot),
}));

vi.mock('@send-frontend/lib/queries/folderQueries', () => ({
  useFolderQuery: vi.fn(() => ({
    data: ref(queryData.value),
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
    selectedFolder: null,
    selectedFile: null,
    getDefaultFolderId,
  })),
}));

vi.mock('@send-frontend/stores/api-store', () => ({
  default: vi.fn(() => ({ api: {} })),
}));

vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: vi.fn(() => ({ keychain })),
}));

vi.mock('@send-frontend/apps/send/stores/status-store', () => ({
  useStatusStore: vi.fn(() => ({ isRouterLoading: ref(false), progress: {} })),
}));

async function mountAt(failureStatus: number | null) {
  queryData.value = { type: 'subtree', data: null, folders: [], failureStatus };
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes });
  router.push('/send/folder/old-id');
  await router.isReady();
  const replace = vi.spyOn(router, 'replace');
  mount(FolderView, {
    global: {
      plugins: [router, pinia],
      provide: { [DayJsKey as symbol]: () => ({ to: () => '' }) },
    },
  });
  await flushPromises();
  return replace;
}

describe('FolderView — recovery from a deleted folder (#1354)', () => {
  beforeEach(() => {
    keychain.locked = false;
    getDefaultFolderId.mockReset().mockResolvedValue('new-id');
  });

  it('replaces the route with the current default folder on an unlocked 403', async () => {
    const replace = await mountAt(403);

    expect(replace).toHaveBeenCalledWith('/send/folder/new-id');
  });

  it.each([
    ['there is no default folder', null],
    ['the default folder is the failing one', 'old-id'],
  ])('does not redirect when %s (no redirect loop)', async (_, defaultId) => {
    getDefaultFolderId.mockResolvedValue(defaultId);

    const replace = await mountAt(404);

    expect(getDefaultFolderId).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });

  it('leaves the locked-keychain case to the passphrase recovery path', async () => {
    keychain.locked = true;

    const replace = await mountAt(403);

    expect(getDefaultFolderId).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('does nothing when the folder loaded', async () => {
    const replace = await mountAt(null);

    expect(getDefaultFolderId).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
