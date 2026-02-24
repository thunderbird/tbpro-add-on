import { useIsExtension } from '@send-frontend/composables/useIsExtension';
import { useFolderStore } from '@send-frontend/stores';
import { computed } from 'vue';

export const useNavigation = () => {
  const { isRunningInsideThunderbird } = useIsExtension();
  const { rootFolderId } = useFolderStore();
  const rootFolderIdValue = computed(() =>
    rootFolderId ? `/send/folder/${rootFolderId}` : '/send'
  );

  const navLinkPaths = [
    {
      path: isRunningInsideThunderbird.value
        ? '/send/profile?showDashboard=true'
        : '/send/profile',
      label: 'Dashboard',
    },
    { path: rootFolderIdValue.value, label: 'Encrypted Files' },
    { path: '/send/security-and-privacy', label: 'Security & Privacy' },
  ];

  return {
    navLinkPaths,
  };
};
