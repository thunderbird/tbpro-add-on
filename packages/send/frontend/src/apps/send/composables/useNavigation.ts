import { useIsExtension } from '@send-frontend/composables/useIsExtension';
import { useFolderStore } from '@send-frontend/stores';
import { storeToRefs } from 'pinia';
import { computed, reactive } from 'vue';

export const useNavigation = () => {
  const { isRunningInsideThunderbird } = useIsExtension();
  // Keep the store ref (not a snapshot) so mounted links follow a new default
  // folder, e.g. after Reset Encryption Key (#1354).
  const { rootFolderId } = storeToRefs(useFolderStore());

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
    path: computed(() =>
      rootFolderId.value ? `/send/folder/${rootFolderId.value}` : '/send'
    ),
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
