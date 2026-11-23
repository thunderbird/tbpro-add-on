<script setup lang="ts">
import {
  NoticeBar,
  NoticeBarTypes,
  PrimaryButton,
} from '@thunderbirdops/services-ui';
import { useL10n } from '@send-frontend/l10n';

defineProps<{
  onRecover: () => void;
}>();
const { t } = useL10n();
</script>

<template>
  <div>
    <NoticeBar class="access-locked" :type="NoticeBarTypes.Warning">
      <p class="message">{{ t('send-security-locked') }}</p>
      <div class="actions">
        <a
          href="https://support.tb.pro"
          target="_blank"
          rel="noopener noreferrer"
          class="learn-more"
        >
          {{ t('send-security-learn-more') }}
        </a>
        <PrimaryButton
          class="recover-access"
          data-testid="recover-access-button"
          @click="onRecover"
        >
          {{ t('send-security-recover-button') }}
        </PrimaryButton>
      </div>
    </NoticeBar>
  </div>
</template>

<style scoped>
.access-locked > :nth-child(2) {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.message {
  flex: 1;
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.learn-more {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  color: var(--colour-ti-secondary);
  text-decoration: underline;
  border-radius: 0.25rem;
  transition: background-color 0.2s;
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

.recover-access:hover {
  background-color: var(--colour-primary-default);
}

.recover-access:active {
  background-color: var(--colour-primary-pressed);
}
</style>
