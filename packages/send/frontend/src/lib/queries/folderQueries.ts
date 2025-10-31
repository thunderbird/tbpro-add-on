import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import type {
  Container,
  ContainerResponse,
} from '@send-frontend/apps/send/stores/folder-store.types';
import { useQuery } from '@tanstack/vue-query';
import { computed, type Ref } from 'vue';

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * Fetches the subtree for a specific folder ID using the existing store method
 */
export const fetchFolderSubtree = async (
  folderStore: ReturnType<typeof useFolderStore>,
  folderId: string
): Promise<ContainerResponse> => {
  await folderStore.fetchSubtree(folderId);
  return folderStore.rootFolder!;
};

/**
 * Fetches user folders (root level) using the existing store method
 */
export const fetchUserFolders = async (
  folderStore: ReturnType<typeof useFolderStore>
): Promise<Container[]> => {
  await folderStore.fetchUserFolders();
  return folderStore.visibleFolders;
};

/**
 * Hook for fetching folder data with caching that mimics goToRootFolder behavior
 * @param folderId - The folder ID to fetch. If null, fetches root folders
 */
export const useFolderQuery = (
  folderId: string | null | Ref<string | null>
) => {
  const folderStore = useFolderStore();

  const folderIdComputed = computed(() => {
    return typeof folderId === 'object' ? folderId.value : folderId;
  });

  return useQuery({
    queryKey: ['folder', folderIdComputed],
    queryFn: async () => {
      const id = folderIdComputed.value;
      if (id) {
        await folderStore.fetchSubtree(id);
        return {
          type: 'subtree' as const,
          data: folderStore.rootFolder,
          folders: folderStore.visibleFolders,
        };
      } else {
        await folderStore.fetchUserFolders();
        // Clear selection when going to root folders
        folderStore.setSelectedFolder('');
        return {
          type: 'userFolders' as const,
          data: null,
          folders: folderStore.visibleFolders,
        };
      }
    },
    staleTime: FIVE_MINUTES,
    gcTime: 10 * FIVE_MINUTES, // Keep cached data for 50 minutes
    enabled: true, // Always enabled since we need folder data
  });
};

/**
 * Composable that replaces folderStore.goToRootFolder with cached queries
 * This provides the same interface but with caching benefits
 */
export const useGoToRootFolder = (
  folderId: string | null | Ref<string | null>
) => {
  const query = useFolderQuery(folderId);

  return {
    ...query,
    // Provide a method that matches the original goToRootFolder API
    goToRootFolder: async (newFolderId?: string | null) => {
      if (newFolderId !== undefined) {
        // If a new folder ID is provided, we need to create a new query
        // This is handled by the parent component updating the folderId reactive value
        console.warn(
          'Use reactive folderId parameter instead of passing newFolderId to goToRootFolder'
        );
      }
      return await query.refetch();
    },
  };
};
