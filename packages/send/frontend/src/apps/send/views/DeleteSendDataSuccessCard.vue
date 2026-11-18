<script setup lang="ts">
import { useL10n } from '@send-frontend/l10n';
import { BaseButton } from '@thunderbirdops/services-ui';
import KeysTemplate from './KeysTemplate.vue';

const { t } = useL10n();

const returnToDashboard = () => {
  // Full navigation (not router.push) so the app reloads and recreates a
  // default folder now that all previous Send folders have been deleted.
  window.location.assign('/send/profile');
};
</script>

<template>
  <KeysTemplate>
    <div class="success-card">
      <h1 class="title">{{ t('send-delete-data-done-title') }}</h1>

      <p class="description">{{ t('send-delete-data-done-body') }}</p>

      <p class="description">{{ t('send-delete-data-done-mail') }}</p>

      <BaseButton
        data-testid="delete-send-data-return"
        @click="returnToDashboard"
      >
        {{ t('send-delete-data-done-button') }}
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
  color: var(--colour-ti-secondary);
  margin: 0;
}
</style>
