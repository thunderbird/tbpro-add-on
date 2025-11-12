<script setup lang="ts">
defineProps<{
  onRecover: () => void;
}>();
</script>

<template>
  <div class="access-locked">
    <div class="icon">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </div>
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
      <button
        class="recover-access"
        data-testid="recover-access-button"
        @click="onRecover"
      >
        Recover Access
      </button>
    </div>
  </div>
</template>

<style scoped>
.access-locked {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background-color: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: 0.375rem;
  color: #92400e;
}

.icon {
  flex-shrink: 0;
  color: #f59e0b;
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
  color: #92400e;
  text-decoration: none;
  border-radius: 0.25rem;
  transition: background-color 0.2s;
}

.learn-more:hover {
  background-color: #fde68a;
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
