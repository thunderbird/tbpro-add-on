<script setup lang="ts">
import ProButton from '@send-frontend/apps/common/ProButton.vue';
import { useL10n } from '@send-frontend/l10n';
import KeysTemplate from './KeysTemplate.vue';

type Props = {
  onRecover: () => void;
};

const { onRecover } = defineProps<Props>();
const { t } = useL10n();
</script>

<template>
  <KeysTemplate>
    <div class="">
      <div class="" style="margin-bottom: 32px">
        <h1 class="title">{{ t('send-security-title') }}</h1>

        <div class="description">
          <h3>{{ t('send-keys-manage-title') }}</h3>
          <p>{{ t('send-security-description') }}</p>
        </div>

        <ProButton
          class="recover-access"
          data-testid="recover-access-button-security-privacy"
          @click="onRecover"
        >
          {{ t('send-security-recover-button') }}
        </ProButton>
      </div>
    </div>
  </KeysTemplate>
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';

h3 {
  font-weight: 700;
}

.title {
  font-size: 24px;
  font-weight: 500;
  color: var(--colour-ti-highlight);
}

.description {
  margin-bottom: 2rem;
  line-height: 1.6;
  color: var(--colour-ti-base);
}

.recover-access {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--colour-ti-base-inverted);
  background-color: var(--colour-primary-default);
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: background-color 0.2s;
}
</style>
