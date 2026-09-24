<script setup lang="ts">
import { StandardFooter } from '@thunderbirdops/services-ui';
import {
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
  CONTACT_FORM_URL,
  STATUS_PAGE_URL,
  IDEAS_PAGE_URL,
} from '@send-frontend/apps/common/constants';
import { useAuth } from '@send-frontend/lib/auth';
import { useNavigation } from '../composables/useNavigation';

const { isLoggedIn } = useAuth();
const { navLinkPaths } = useNavigation();
</script>

<template>
  <StandardFooter
    contribute-to-this-site-url="https://github.com/thunderbird/tbpro-add-on"
  >
    <template #default>
      <nav class="send-navigation">
        <div class="top-row">
          <img src="@send-frontend/apps/send/assets/thunderbird-logo.svg" alt="Thunderbird" />

          <ul v-if="isLoggedIn">
            <li v-for="navLink in navLinkPaths" :key="navLink.path">
              <router-link :to="navLink.path">{{ navLink.label }}</router-link>
            </li>
          </ul>

          <ul v-else>
            <li>
              <router-link to="/login">Login</router-link>
            </li>
          </ul>
        </div>

        <ul class="default-links">
          <li>
            <a :href="STATUS_PAGE_URL" target="_blank" rel="noopener noreferrer">
              Status
            </a>
          </li>
          <li>
            <a :href="CONTACT_FORM_URL" target="_blank" rel="noopener noreferrer">
              Need help? Visit Support
            </a>
          </li>
          <li>
            <a :href="IDEAS_PAGE_URL" target="_blank" rel="noopener noreferrer">
              Ideas?
            </a>
          </li>
        </ul>
      </nav>
    </template>

    <template #privacyPolicy>
      <a :href="PRIVACY_POLICY_URL" target="_blank"> Privacy Policy </a>
    </template>

    <template #legal>
      <a :href="TERMS_OF_SERVICE_URL" target="_blank"> Legal </a>
    </template>
  </StandardFooter>
</template>

<style scoped>
.send-navigation {
  display: flex;
  flex-direction: column;
  align-items: start;
  gap: 1.75rem;

  .top-row {
    display: flex;
    flex-direction: column;
    align-items: start;
    width: 100%;

    img {
      margin-block-end: 2rem;
    }
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-family: metropolis;
    font-weight: 600;
    font-size: 0.8125rem;
    text-transform: uppercase;
    color: white;
  }

  .default-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-family: Inter, sans-serif;
    font-weight: 400;
    font-size: 0.6875rem;
    text-transform: none;
    color: #d4d4d8; /* TODO: Update this once we source colours from services-ui after 2.x */

    li {
      display: flex;
      align-items: center;

      &:not(:last-child)::after {
        content: '|';
        margin-inline-start: 0.5rem;
      }
    }

    a {
      text-decoration: underline;
      color: inherit;
    }
  }
}

@media (min-width: 48rem) {
  .send-navigation {
    gap: 0.75rem;

    .top-row {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      height: 61px;

      img {
        margin-block-end: 0;
      }
    }

    .default-links {
      width: 100%;
      justify-content: flex-end;
    }

    ul {
      gap: 3rem;
    }
  }
}
</style>
