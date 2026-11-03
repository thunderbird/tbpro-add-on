<script setup lang="ts">
type Props = {
  primary?: boolean;
  secondary?: boolean;
  danger?: boolean;
  size?: 'medium' | 'small' | 'xsmall';
};

withDefaults(defineProps<Props>(), {
  primary: false,
  secondary: false,
  danger: false,
  size: 'small',
});
</script>

<template>
  <button
    class="base-button"
    :class="{
      primary,
      secondary,
      danger,
      default: !primary && !secondary && !danger,
      'size-medium': size === 'medium',
      'size-small': size === 'small',
      'size-xsmall': size === 'xsmall',
    }"
  >
    <slot></slot>
  </button>
</template>

<style scoped>
.base-button {
  border-radius: 3px;
  box-shadow: 0px 6px 3px -4px rgba(21, 66, 124, 0.3);
  display: inline-flex;
  min-width: 96px;
  padding: 8px 16px;
  justify-content: center;
  align-items: center;
  gap: 10px;
  transition: all 0.2s;
  font-size: 0.875rem;
}

.default {
  border: 1px solid var(--colour-surface-border);
  background: var(--colour-surface-subtle);
  color: var(--colour-ti-secondary);
}

.default:hover {
  background: var(--colour-surface-subtle);
}

.primary {
  border: 1px solid var(--colour-primary-hover);
  background: var(--colour-primary-default);
  color: var(--colour-ti-base-inverted);
}

.primary:hover {
  background: var(--colour-primary-hover);
}

.secondary {
  border: 1px solid var(--colour-surface-border-intense);
  background: var(--colour-surface-subtle);
  color: var(--colour-ti-base);
}

.secondary:hover {
  background: var(--colour-surface-border);
}

.danger {
  border: 1px solid var(--colour-critical-default);
  background: var(--colour-critical-default);
  color: var(--colour-ti-base-inverted);
}

.danger:hover {
  background: var(--colour-critical-default);
}

.size-small {
  min-width: 96px;
  padding: 8px 16px;
  font-size: 0.875rem;
}

.size-xsmall {
  min-width: 64px;
  padding: 4px 8px;
  font-size: 0.75rem;
}

.size-medium {
  min-width: 128px;
  padding: 12px 24px;
  font-size: 1rem;
}
</style>
