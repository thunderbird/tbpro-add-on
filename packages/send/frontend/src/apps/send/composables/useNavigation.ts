import { useIsExtension } from '@send-frontend/composables/useIsExtension';
import { useFolderStore } from '@send-frontend/stores';
import { computed } from 'vue';

export const useNavigation = () => {
  const { isRunningInsideThunderbird } = useIsExtension();
  const { rootFolderId } = useFolderStore();
  const rootFolderIdValue = computed(() =>
    rootFolderId ? `/send/folder/${rootFolderId}` : '/send'
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

  const filesLink = {
    path: rootFolderIdValue.value,
    label: 'Manage Files',
  };

  const navLinkPaths = [
    dashboardLink,
    filesLink,
    settingsLink,
  ];

  return {
    navLinkPaths,
    dashboardLink,
    filesLink,
    settingsLink,
  };
};
