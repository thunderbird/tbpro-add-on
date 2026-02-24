<script setup lang="ts">
import UserMenu from '@send-frontend/apps/send/components/UserMenu.vue';
import { useAuth } from '@send-frontend/lib/auth';
import { useUserStore } from '@send-frontend/stores';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useNavigation } from '../composables/useNavigation';

const { currentRoute } = useRouter();
const { isLoggedIn } = useAuth();
const { user } = useUserStore();
const { navLinkPaths } = useNavigation();

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
  <header>
    <router-link to="/">
      <img src="@send-frontend/apps/send/assets/send-logo.svg" alt="Send" />
    </router-link>

    <template v-if="isLoggedIn">
      <!-- <RenderOnEnvironment :environment-type="['WEB APP OUTSIDE THUNDERBIRD']"> -->
      <nav class="desktop">
        <ul>
          <li>
            <router-link
              v-for="navLink in navLinkPaths"
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

      <user-menu :username="avatarUsername" />
    </template>
  </header>
</template>

<style scoped>
header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  height: 68px;
  padding: 1rem;
  backdrop-filter: blur(24px);
  box-shadow: 0 0.5rem 1.5rem 0 rgba(0, 0, 0, 0.1);
  background-image: linear-gradient(to top, #1a202c, #483623);
  width: 100%;

  /* Without this we can't be on top of main content when we need */
  position: relative;
  z-index: 999;

  &:first-child {
    margin-right: auto;
  }

  &:last-child {
    margin-left: auto;
  }

  nav.desktop {
    display: none;
  }

  .login-button-link {
    text-decoration: none;

    .brand.outline {
      color: var(--colour-ti-base-dark);
    }
  }

  ul {
    display: flex;
    gap: 0.5rem;
    font-family: metropolis, sans-serif;
    font-weight: 600;
    font-size: 0.8125rem;
    letter-spacing: 0.65px;
    text-transform: uppercase;

    a {
      color: white;
      text-decoration: none;
      padding: 0.75rem 1.25rem;

      &.active {
        background-color: var(--colour-neutral-lower-dark);
        border-radius: 0.5rem;
        box-shadow: inset 0 0.25rem 0.25rem 0 rgba(0, 0, 0, 0.15);
      }
    }
  }
}

@media (min-width: 768px) {
  header {
    nav.desktop {
      display: block;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }
  }
}

@media (min-width: 1024px) {
  header > :first-child,
  header > :last-child {
    padding: 1rem 2rem;
  }
}
</style>
