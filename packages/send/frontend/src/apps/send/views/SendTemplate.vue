<script setup lang="ts">
import { StandardFooter } from '@thunderbirdops/services-ui';
import { useRoute } from 'vue-router';
import {
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
} from '@send-frontend/apps/common/constants';
import NavBar from '@send-frontend/apps/send/components/NavBar.vue';

const route = useRoute();
const isPrintMode = route.query.print !== undefined;
</script>

<template>
  <template v-if="isPrintMode">
    <slot></slot>
  </template>
  <template v-else>
    <NavBar />

    <div class="content">
      <slot></slot>
    </div>

    <StandardFooter
      contribute-to-this-site-url="https://github.com/thunderbird/tbpro-add-on"
    >
      <template #privacyPolicy>
        <a :href="PRIVACY_POLICY_URL" target="_blank"> Privacy Policy </a>
      </template>

      <template #legal>
        <a :href="TERMS_OF_SERVICE_URL" target="_blank"> Legal </a>
      </template>
    </StandardFooter>
  </template>
</template>

<style lang="css" scoped>
.content {
  min-height: calc(100vh - 250px - 60px);
}
</style>
