import { useNavigation } from '@send-frontend/apps/send/composables/useNavigation';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

// #1354: mounted nav links must follow the store when the default folder changes.
const useFakeFolderStore = defineStore('fakeFolder', () => ({
  rootFolderId: ref<string | null>('old-folder'),
}));

vi.mock('@send-frontend/stores', () => ({
  useFolderStore: () => useFakeFolderStore(),
}));

vi.mock('@send-frontend/composables/useIsExtension', () => ({
  useIsExtension: () => ({ isRunningInsideThunderbird: ref(false) }),
}));

describe('useNavigation — filesLink', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('updates the path when rootFolderId changes after the link was created', () => {
    const { filesLink, navLinkPaths } = useNavigation();
    expect(filesLink.path).toBe('/send/folder/old-folder');

    useFakeFolderStore().rootFolderId = 'new-folder';

    expect(filesLink.path).toBe('/send/folder/new-folder');
    expect(navLinkPaths).toContain(filesLink);
  });

  it('falls back to /send when there is no default folder', () => {
    const { filesLink } = useNavigation();

    useFakeFolderStore().rootFolderId = null;

    expect(filesLink.path).toBe('/send');
  });
});
