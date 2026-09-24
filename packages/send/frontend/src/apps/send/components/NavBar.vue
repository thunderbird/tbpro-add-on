<script setup lang="ts">
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
const { navLinkPaths } = useNavigation();
const prefersDark = usePreferredDark();

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
    <router-link class="send-logo" to="/">
      <send-logo :force-dark="prefersDark" />
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
  padding-inline: 1rem;
  background-color: #f7f7f8;
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

  ul,
  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 100%;
  }

  /* TODO: Update these colours once we source them from services-ui */
  a:not(.send-logo) {
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
    color: #52525b;

    &.active {
      color: #19518f;
    }
  }
}

header.dark {
  background-color: #111113;

  a:not(.send-logo) {
    color: #d4d4d8;

    &.active {
      color: #5fa6e8;
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
