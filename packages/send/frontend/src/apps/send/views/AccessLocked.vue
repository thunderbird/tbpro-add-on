<script setup lang="ts">
import {
  NoticeBar,
  NoticeBarTypes,
  PrimaryButton,
} from '@thunderbirdops/services-ui';

defineProps<{
  onRecover: () => void;
}>();
</script>

<template>
  <div>
    <NoticeBar class="access-locked" :type="NoticeBarTypes.Warning">
      <p class="message">
        Files access is locked. Restore or reset your encryption key to access
        file storage.
      </p>
      <div class="actions">
        <a
          href="https://support.tb.pro"
          target="_blank"
          rel="noopener noreferrer"
          class="learn-more"
        >
          Learn more
        </a>
        <PrimaryButton
          class="recover-access"
          data-testid="recover-access-button"
          @click="onRecover"
        >
          Recover Access
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
  color: var(--text-icon-secondary);
  text-decoration: underline;
  border-radius: 0.25rem;
  transition: background-color 0.2s;
}

.recover-access {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: white;
  background-color: #0a84ff;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.recover-access:hover {
  background-color: #0060df;
}

.recover-access:active {
  background-color: #003eaa;
}
</style>
