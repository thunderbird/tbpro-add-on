<script setup lang="ts">
import {
  AppDrawer,
  AppointmentIcon,
  MailIcon,
  SendIcon,
  SettingsIcon,
  type AppDrawerApp,
} from '@thunderbirdops/services-ui';
import {
  APPOINTMENT_URL,
  THUNDERMAIL_URL,
} from '@send-frontend/apps/common/constants';
import SendLogo from '@send-frontend/apps/send/components/SendLogo.vue';
import UserMenu from '@send-frontend/apps/send/components/UserMenu.vue';
import { useAuth } from '@send-frontend/lib/auth';
import { useUserStore } from '@send-frontend/stores';
import { usePreferredDark } from '@vueuse/core';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useNavigation } from '../composables/useNavigation';

const { currentRoute } = useRouter();
const { isLoggedIn } = useAuth();
const { user } = useUserStore();
const { navLinkPaths, dashboardLink, settingsLink } = useNavigation();
const prefersDark = usePreferredDark();

const primaryNavLinks = navLinkPaths.filter(
  (link) => link !== dashboardLink && link !== settingsLink
);
const isSettingsActive = computed(() =>
  currentRoute.value.path.startsWith(settingsLink.path)
);

const apps: AppDrawerApp[] = [
  { id: 'mail', name: 'Mail', icon: MailIcon, href: THUNDERMAIL_URL },
  { id: 'send', name: 'Send', icon: SendIcon, current: true },
  {
    id: 'appointment',
    name: 'Appointment',
    icon: AppointmentIcon,
    href: APPOINTMENT_URL,
  },
];

const avatarUsername = computed(() => user?.thundermailEmail || user?.email);

function isNavLinkActive(navPath: string, currentPath: string): boolean {
  if (currentPath === navPath) {
    return true;
  }

  // For the '/send' link, also match '/send/:id' but exclude other nav link paths
  if (navPath === '/send') {
    const otherNavPaths = navLinkPaths
      .filter((link) => link.path !== '/send')
      .map((link) => link.path);
    return (
      currentPath.startsWith('/send/') &&
      !otherNavPaths.some((p) => currentPath.startsWith(p))
    );
  }

  return false;
}
</script>

<template>
  <header :class="{ dark: prefersDark }">
    <router-link
      class="send-logo"
      data-testid="navlink-dashboard"
      :to="isLoggedIn ? dashboardLink.path : '/'"
    >
      <send-logo :force-dark="prefersDark" />
    </router-link>

    <template v-if="isLoggedIn">
      <!-- <RenderOnEnvironment :environment-type="['WEB APP OUTSIDE THUNDERBIRD']"> -->
      <nav class="desktop">
        <ul>
          <li>
            <router-link
              v-for="navLink in primaryNavLinks"
              :key="navLink.path"
              :data-testid="`navlink-${navLink.label.toLowerCase().replace(/\s+/g, '-')}`"
              :to="navLink.path"
              :class="{
                active: isNavLinkActive(navLink.path, currentRoute.path),
              }"
            >
              {{ navLink.label }}
            </router-link>
          </li>
        </ul>
      </nav>

      <div class="nav-actions">
        <router-link
          :to="settingsLink.path"
          class="nav-settings-button"
          data-testid="navlink-settings"
          :class="{ active: isSettingsActive }"
          :aria-label="settingsLink.label"
        >
          <settings-icon aria-hidden="true" />
        </router-link>
        <app-drawer :apps="apps" />
        <user-menu :username="avatarUsername" />
      </div>
    </template>
  </header>
</template>

<style scoped>
header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  height: 68px;
  padding-inline: 1rem;
  background-color: var(--colour-surface-lower);
  box-shadow: 0 8px 24px 0 rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(12px);
  width: 100%;

  /* Without this we can't be on top of main content when we need */
  position: relative;
  z-index: 999;

  nav.desktop {
    display: none;
  }

  .send-logo svg {
    height: 3rem;
    width: auto;
  }

  .nav-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;

    .nav-settings-button,
    :deep(.app-drawer__button),
    > .user-menu {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 3rem;
      height: 3rem;
      padding: 0;
    }

    :deep(.app-drawer__button svg),
    .nav-settings-button svg {
      width: 1.5rem;
      height: 1.5rem;
    }

    .nav-settings-button {
      color: var(--colour-ti-base-light);

      &.active {
        color: var(--colour-ti-highlight);
      }
    }
  }

  ul,
  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 100%;
  }

  nav a {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 120px;
    padding-inline: 1rem;
    height: 2.25rem;
    font-family: metropolis, sans-serif;
    font-size: 0.8125rem;
    font-weight: 600;
    text-transform: uppercase;
    text-decoration: none;
    color: var(--colour-ti-secondary-light);

    &.active {
      color: var(--colour-primary-pressed);
    }
  }
}

header.dark {
  /* There is no services-ui token for the forced dark header background. */
  background-color: #111113;

  /*
   * services-ui only applies its dark tokens under `html.dark`, which we can't
   * set yet without switching the whole app to dark mode. Use the explicit
   * `-dark` tokens where services-ui provides them; the few values it doesn't
   * expose as `-dark` tokens are copied from its `html.dark` block.
   * TODO: Remove once the app supports dark mode via html.dark.
   */
  --colour-surface-raised: #2b2b2f;
  --colour-surface-subtle: var(--colour-surface-subtle-dark);
  --colour-surface-border: #52525b;
  /* services-ui components still read the (deprecated) neutral tokens. */
  --colour-neutral-raised: var(--colour-surface-raised);
  --colour-neutral-subtle: var(--colour-surface-subtle);
  --colour-neutral-border: var(--colour-surface-border);
  --colour-primary-soft: #262c40;
  --colour-primary-default: var(--colour-primary-default-dark);
  --colour-primary-hover: #32aeff;
  --colour-primary-pressed: #1b90f5;
  --colour-ti-secondary: var(--colour-ti-secondary-dark);
  --colour-ti-muted: #a1a1aa;

  :deep(.app-drawer__button) {
    color: var(--colour-ti-secondary-dark);
  }

  .nav-actions .nav-settings-button {
    color: var(--colour-ti-secondary);

    &.active {
      color: var(--colour-ti-highlight);
    }
  }

  :deep(.avatar .initials) {
    color: var(--colour-ti-base-dark);
  }

  nav a {
    color: var(--colour-ti-secondary-dark);

    &.active {
      color: var(--colour-primary-default-dark);
    }
  }
}

@media (min-width: 768px) {
  header nav.desktop {
    display: block;
  }
}

@media (min-width: 1024px) {
  header {
    padding-inline: 3.5rem;
  }
}
</style>
