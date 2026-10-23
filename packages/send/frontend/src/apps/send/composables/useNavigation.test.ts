import { describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { useNavigation } from './useNavigation';

const store = reactive({ rootFolderId: null as string | null });

vi.mock('@send-frontend/composables/useIsExtension', () => ({
  useIsExtension: () => ({ isRunningInsideThunderbird: { value: false } }),
}));
vi.mock('@send-frontend/stores', () => ({
  useFolderStore: () => store,
}));

describe('useNavigation', () => {
  it('updates the Manage Files link once the default folder loads', () => {
    store.rootFolderId = null;
    const { filesLink, navLinkPaths } = useNavigation();

    expect(filesLink.path).toBe('/send');
    store.rootFolderId = 'abc';
    expect(filesLink.path).toBe('/send/folder/abc');
    expect(navLinkPaths.map((link) => link.path)).toContain('/send/folder/abc');
  });
});
