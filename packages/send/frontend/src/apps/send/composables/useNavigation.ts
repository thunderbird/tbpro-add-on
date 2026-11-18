import { useIsExtension } from '@send-frontend/composables/useIsExtension';
import { useFolderStore } from '@send-frontend/stores';
import { storeToRefs } from 'pinia';
import { t } from '@send-frontend/l10n';
import { computed, reactive } from 'vue';

export const useNavigation = () => {
  const { isRunningInsideThunderbird } = useIsExtension();
  // Keep the store ref (not a snapshot) so mounted links follow a new default
  // folder, e.g. after Reset Encryption Key (#1354).
  const { rootFolderId } = storeToRefs(useFolderStore());

  // `id` is the stable data-testid suffix; `label` is read on render so it
  // follows the locale.
  const settingsLink = {
    id: 'settings',
    path: '/send/security-and-privacy',
    get label() {
      return t('send-nav-settings');
    },
  };

  const dashboardLink = {
    id: 'dashboard',
    path: isRunningInsideThunderbird.value
      ? '/send/profile?showDashboard=true'
      : '/send/profile',
    get label() {
      return t('send-nav-dashboard');
    },
  };

  const filesLink = reactive({
    id: 'manage-files',
    path: computed(() =>
      rootFolderId.value ? `/send/folder/${rootFolderId.value}` : '/send'
    ),
    get label() {
      return t('send-nav-manage-files');
    },
  });

  const navLinkPaths = [dashboardLink, filesLink, settingsLink];

  return {
    navLinkPaths,
    dashboardLink,
    filesLink,
    settingsLink,
  };
};
