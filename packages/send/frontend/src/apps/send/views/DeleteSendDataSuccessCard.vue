<script setup lang="ts">
import { BaseButton } from '@thunderbirdops/services-ui';
import KeysTemplate from './KeysTemplate.vue';

const returnToDashboard = () => {
  // Full navigation (not router.push) so the app reloads and recreates a
  // default folder now that all previous Send folders have been deleted.
  window.location.assign('/send/profile');
};
</script>

<template>
  <KeysTemplate>
    <div class="success-card">
      <h1 class="title">Your Send data has been deleted</h1>

      <p class="description">
        All encrypted files in your Thundermail Send storage have been
        permanently deleted. You can start fresh now.
      </p>

      <p class="description">Your Thundermail data was not affected.</p>

      <BaseButton
        data-testid="delete-send-data-return"
        @click="returnToDashboard"
      >
        Return to dashboard
      </BaseButton>
    </div>
  </KeysTemplate>
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';

.success-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.title {
  margin-bottom: 0.5rem;
}

.description {
  font-family: Inter;
  font-size: 14px;
  line-height: 1.23;
  color: var(--text-icon-secondary);
  margin: 0;
}
</style>
