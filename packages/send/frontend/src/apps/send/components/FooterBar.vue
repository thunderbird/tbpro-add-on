<script setup lang="ts">
import { StandardFooter } from '@thunderbirdops/services-ui';
import {
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
  CONTACT_FORM_URL,
} from '@send-frontend/apps/common/constants';
import { useAuth } from '@send-frontend/lib/auth';

const { isLoggedIn } = useAuth();
</script>

<template>
  <StandardFooter
    contribute-to-this-site-url="https://github.com/thunderbird/tbpro-add-on"
  >
    <template #default>
      <nav class="send-navigation">
        <router-link to="/send/profile">
          <img src="@send-frontend/apps/send/assets/send-logo.svg" alt="Send" />
        </router-link>

        <div>
          <ul v-if="isLoggedIn">
            <li>
              <router-link to="/send">Encrypted Files</router-link>
            </li>
            <li>
              <router-link to="/send/profile">Dashboard</router-link>
            </li>
          </ul>

          <ul v-else>
            <li>
              <router-link to="/login">Login</router-link>
            </li>
          </ul>

          <a :href="CONTACT_FORM_URL" class="contact-support-link">
            Need help? Visit Support
          </a>
        </div>
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
  justify-content: space-between;

  img {
    align-self: start;
    margin-block-end: 2rem;
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

  .contact-support-link {
    display: block;
    font-family: Inter, sans-serif;
    font-size: 0.6875rem;
    font-weight: normal;
    text-decoration: underline;
    margin-block-start: 1.5rem;
    color: white;
  }
}

@media (min-width: 1024px) {
  .send-navigation {
    flex-direction: row;
    align-items: center;

    img {
      margin-block-end: 0;
    }

    ul {
      gap: 3rem;
      justify-content: end;
    }

    .contact-support-link {
      text-align: end;
    }
  }
}
</style>
