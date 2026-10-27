import { useIsExtension } from '@send-frontend/composables/useIsExtension';
import { useFolderStore } from '@send-frontend/stores';
import { computed, reactive } from 'vue';

export const useNavigation = () => {
  const { isRunningInsideThunderbird } = useIsExtension();
  const folderStore = useFolderStore();
  // Reactive: the nav renders before the default folder id has loaded.
  const rootFolderIdValue = computed(() =>
    folderStore.rootFolderId
      ? `/send/folder/${folderStore.rootFolderId}`
      : '/send'
  );

  const settingsLink = {
    path: '/send/security-and-privacy',
    label: 'Settings',
  };

  const dashboardLink = {
    path: isRunningInsideThunderbird.value
      ? '/send/profile?showDashboard=true'
      : '/send/profile',
    label: 'Dashboard',
  };

  const filesLink = reactive({
    path: rootFolderIdValue,
    label: 'Manage Files',
  });

  const navLinkPaths = [dashboardLink, filesLink, settingsLink];

  return {
    navLinkPaths,
    dashboardLink,
    filesLink,
    settingsLink,
  };
};
