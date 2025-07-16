import { RouteRecordRaw, createRouter, createWebHistory } from 'vue-router';

import FolderView from '@send-frontend/apps/send/components/FolderView.vue';
import ProfileView from '@send-frontend/apps/send/components/ProfileView.vue';
import Received from '@send-frontend/apps/send/components/Received.vue';
import Sent from '@send-frontend/apps/send/components/Sent.vue';
import Send from '@send-frontend/apps/send/pages/WebPage.vue';

import Share from '@send-frontend/apps/send/pages/SharePage.vue';
import { matchMeta } from '@send-frontend/lib/helpers';
import { restoreKeysUsingLocalStorage } from '@send-frontend/lib/keychain';
import useApiStore from '@send-frontend/stores/api-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';

import { IS_DEV } from '@send-frontend/lib/clientConfig';
import { getCanRetry } from '@send-frontend/lib/validations';

import { useFolderStore } from '@send-frontend/stores';
import useMetricsStore from '@send-frontend/stores/metrics';
import NotFoundPage from '../common/NotFoundPage.vue';
import ExtensionPage from './ExtensionPage.vue';
import LoginPage from './LoginPage.vue';
import ManagementPage from './ManagementPage.vue';
import LockedPage from './pages/LockedPage.vue';
import { useStatusStore } from './stores/status-store';

enum META_OPTIONS {
  redirectOnValidSession = 'redirectOnValidSession',
  requiresValidToken = 'requiresValidToken',
  autoRestoresKeys = 'autoRestoresKeys',
  requiresBackedUpKeys = 'requiresBackedUpKeys',
  requiresRetryCountCheck = 'requiresRetryCountCheck',
  resolveDefaultFolder = 'resolveDefaultFolder',
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/send',
  },
  {
    path: '/login',
    component: LoginPage,
    meta: { [META_OPTIONS.redirectOnValidSession]: true },
  },
  {
    path: '/send',
    component: Send,
    children: [
      {
        path: '',
        redirect: '/send/folder/root',
        meta: {
          [META_OPTIONS.requiresValidToken]: true,
          [META_OPTIONS.autoRestoresKeys]: true,
          [META_OPTIONS.requiresBackedUpKeys]: true,
        },
      },
      {
        path: 'folder/root',
        component: FolderView,
        meta: {
          [META_OPTIONS.requiresValidToken]: true,
          [META_OPTIONS.autoRestoresKeys]: true,
          [META_OPTIONS.requiresBackedUpKeys]: true,
          [META_OPTIONS.resolveDefaultFolder]: true,
        },
      },
      {
        path: 'profile',
        component: ProfileView,
        meta: {
          [META_OPTIONS.requiresValidToken]: true,
          [META_OPTIONS.autoRestoresKeys]: true,
        },
      },
      {
        path: 'sent',
        component: Sent,
        meta: {
          [META_OPTIONS.requiresValidToken]: true,
        },
      },
      {
        path: 'received',
        component: Received,
        meta: {
          [META_OPTIONS.requiresValidToken]: true,
        },
      },
      {
        path: 'folder/:id',
        component: FolderView,
        props: true,
        name: 'folder',
        meta: {
          [META_OPTIONS.requiresValidToken]: true,
          [META_OPTIONS.autoRestoresKeys]: true,
          [META_OPTIONS.requiresBackedUpKeys]: true,
        },
      },
    ],
  },
  // Accept share link
  {
    path: '/share/:linkId',
    component: Share,
    meta: { [META_OPTIONS.requiresRetryCountCheck]: true },
  },
  {
    path: '/locked/:linkId',
    component: LockedPage,
  },

  /* 
  TESTING ONLY
  These routes are only available in development mode and are used to render the extension.
  Intended only to be used for testing. 
   */
  {
    path: '/extension',
    children: IS_DEV
      ? [
          { path: 'popup', component: ExtensionPage },
          {
            path: 'management',
            component: ManagementPage,
          },
        ]
      : [],
  },

  // Catch all non defined routes
  {
    path: '/:pathMatch(.*)*',
    component: NotFoundPage,
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to, from, next) => {
  const folderStore = useFolderStore();

  const { keychain } = useKeychainStore();
  const { api } = useApiStore();
  const { validators } = useStatusStore();
  const { metrics } = useMetricsStore();

  //  redirectOnValidSession - means that if the user has a session in local storage, they will be redirected to the Send page

  const redirectOnValidSession = matchMeta(
    to,
    META_OPTIONS.redirectOnValidSession
  );
  const resolveDefaultFolder = matchMeta(to, META_OPTIONS.resolveDefaultFolder);
  const requiresValidToken = matchMeta(to, META_OPTIONS.requiresValidToken);
  const autoRestoresKeys = matchMeta(to, META_OPTIONS.autoRestoresKeys);
  const requiresBackedUpKeys = matchMeta(to, META_OPTIONS.requiresBackedUpKeys);
  const requiresRetryCountCheck = matchMeta(
    to,
    META_OPTIONS.requiresRetryCountCheck
  );

  const { hasLocalStorageSession, isTokenValid, hasBackedUpKeys } =
    await validators();

  if (requiresValidToken && !isTokenValid) {
    metrics.capture('send.invalid.token');
    return next('/login');
  }

  if (redirectOnValidSession && hasLocalStorageSession && isTokenValid) {
    return next('/send/profile');
  }

  if (requiresBackedUpKeys && !hasBackedUpKeys) {
    next('/send/profile');
    return;
  }

  if (autoRestoresKeys) {
    try {
      await restoreKeysUsingLocalStorage(keychain, api);
    } catch (error) {
      console.error('Error restoring keys', error);
    }
  }

  if (to.path === '/send/folder/null') {
    // If the user tries to access the folder with id 'null', we redirect them to the root folder
    const rootFolderId = await folderStore.getDefaultFolderId();
    return next(`/send/folder/${rootFolderId}`);
  }

  if (resolveDefaultFolder) {
    return next(`/send/folder/${folderStore.rootFolderId}`);
  }

  // If a file has exceeded the maximum number of retries, it will be locked.
  // We redirect the user to the locked page.
  if (requiresRetryCountCheck) {
    const canRetry = await getCanRetry(to.params.linkId as string);
    if (!canRetry) {
      next(`/locked/${to.params.linkId}/`);
    }
  }
  next();
});

export default router;
