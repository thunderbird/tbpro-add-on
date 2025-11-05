import { RouteRecordRaw, createRouter, createWebHistory } from 'vue-router';

import FolderView from '@send-frontend/apps/send/components/FolderView.vue';
import ProfileView from '@send-frontend/apps/send/components/ProfileView.vue';
import Send from '@send-frontend/apps/send/pages/WebPage.vue';

import Share from '@send-frontend/apps/send/pages/SharePage.vue';
import { matchMeta } from '@send-frontend/lib/helpers';

import { IS_DEV } from '@send-frontend/lib/clientConfig';
import {
  getCanRetry,
  validateBackedUpKeys,
  validateLocalStorageSession,
  validateToken,
} from '@send-frontend/lib/validations';

import { useIsRouteExtension } from '@send-frontend/composables/isRouteExtension';
import { restoreKeysUsingLocalStorage } from '@send-frontend/lib/keychain';
import {
  useApiStore,
  useConfigStore,
  useFolderStore,
  useKeychainStore,
  useUserStore,
} from '@send-frontend/stores';
import useMetricsStore from '@send-frontend/stores/metrics';
import { storeToRefs } from 'pinia';
import NotFoundPage from '../common/NotFoundPage.vue';
import ExtensionPage from './ExtensionPage.vue';
import LoginPage from './LoginPage.vue';
import ManagementPage from './ManagementPage.vue';
import PostLoginPage from './PostLoginPage.vue';
import LockedPage from './pages/LockedPage.vue';
import LogOutPage from './pages/LogOutPage.vue';
import PromptVerification from './pages/PromptVerification.vue';
import VerifyPage from './pages/VerifyPage.vue';
import { useStatusStore } from './stores/status-store';
import { useVerificationStore } from './stores/verification-store';

enum META_OPTIONS {
  redirectOnValidSession = 'redirectOnValidSession',
  requiresValidToken = 'requiresValidToken',
  autoRestoresKeys = 'autoRestoresKeys',
  requiresBackedUpKeys = 'requiresBackedUpKeys',
  requiresRetryCountCheck = 'requiresRetryCountCheck',
  resolveDefaultFolder = 'resolveDefaultFolder',
  isAvailableForExtension = 'isAvailableForExtension',
  closeOnExtension = 'closeOnExtension',
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/send',
  },
  {
    path: '/login',
    component: LoginPage,
    meta: {
      [META_OPTIONS.redirectOnValidSession]: true,
      [META_OPTIONS.isAvailableForExtension]: true,
    },
  },
  {
    path: '/logout',
    component: LogOutPage,
  },
  {
    path: '/post-login',
    component: PostLoginPage,
  },
  {
    path: '/verify',
    component: VerifyPage,
    meta: {
      [META_OPTIONS.requiresValidToken]: true,
      [META_OPTIONS.requiresBackedUpKeys]: true,
      [META_OPTIONS.autoRestoresKeys]: true,
      [META_OPTIONS.isAvailableForExtension]: true,
    },
  },
  {
    path: '/prompt-verification',
    component: PromptVerification,
    meta: {
      [META_OPTIONS.requiresValidToken]: true,
      [META_OPTIONS.isAvailableForExtension]: true,
    },
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
          [META_OPTIONS.requiresBackedUpKeys]: true,
          [META_OPTIONS.autoRestoresKeys]: true,
          [META_OPTIONS.resolveDefaultFolder]: true,
        },
      },
      {
        path: 'profile',
        component: ProfileView,
        meta: {
          [META_OPTIONS.requiresValidToken]: true,
          [META_OPTIONS.autoRestoresKeys]: true,
          [META_OPTIONS.closeOnExtension]: true,
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
  const { isRouteExtension } = useIsRouteExtension();
  const folderStore = useFolderStore();
  const statusStore = useStatusStore();
  const { isRouterLoading } = storeToRefs(statusStore);
  const { api } = useApiStore();
  const { keychain } = useKeychainStore();
  const userStore = useUserStore();
  const { metrics } = useMetricsStore();
  useVerificationStore();
  const { isExtension } = useConfigStore();

  // We want to show the loading state when navigating to folder routes (on web)
  if (to.path.includes('/folder')) {
    isRouterLoading.value = true;
  }

  //  redirectOnValidSession - means that if the user has a session in local storage, they will be redirected to the Send page
  const redirectOnValidSession = matchMeta(
    to,
    META_OPTIONS.redirectOnValidSession
  );
  const resolveDefaultFolder = matchMeta(to, META_OPTIONS.resolveDefaultFolder);
  const requiresValidToken = matchMeta(to, META_OPTIONS.requiresValidToken);
  const closeOnExtension = matchMeta(to, META_OPTIONS.closeOnExtension);
  const autoRestoresKeys = matchMeta(to, META_OPTIONS.autoRestoresKeys);
  const requiresBackedUpKeys = matchMeta(to, META_OPTIONS.requiresBackedUpKeys);
  const requiresRetryCountCheck = matchMeta(
    to,
    META_OPTIONS.requiresRetryCountCheck
  );
  const isAvailableForExtension = matchMeta(
    to,
    META_OPTIONS.isAvailableForExtension
  );

  // First we make sure that the extension routes are available for extension (if applicable)
  if (isExtension && !isAvailableForExtension) {
    // this route will render empty content inside the extension
    console.log('Extension route not available:', to.path);
  }

  const hasLocalStorageSession = validateLocalStorageSession(userStore);

  if (requiresValidToken) {
    const isTokenValid = await validateToken(api);
    if (!isTokenValid) {
      metrics.capture('send.invalid.token');

      return next('/login');
    }
  }

  // We don't want users to navigate the web application from the extension, just log in
  // So if they're logged in, this window will close
  if (closeOnExtension && isRouteExtension.value) {
    window.close();
  }

  if (redirectOnValidSession && hasLocalStorageSession) {
    const isTokenValid = await validateToken(api);
    if (isTokenValid) return next('/send/profile');
  }

  if (requiresBackedUpKeys) {
    const hasBackedUpKeys = await validateBackedUpKeys(
      userStore.getBackup,
      keychain
    );
    if (!hasBackedUpKeys) {
      next('/send/profile');
      return;
    }
  }

  if (autoRestoresKeys) {
    await restoreKeysUsingLocalStorage(keychain, api);
    // This was meant to avoid restoring keys on every route change, but it causes issues when navigating between routes that require keys
    // if (from.path !== to.path) {
    //   try {
    //     await restoreKeysUsingLocalStorage(keychain, api);
    //   } catch (error) {
    //     console.error('Error restoring keys', error);
    //   }
    // }
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
      return;
    }
  }

  next();
});

export default router;
