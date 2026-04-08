<script setup lang="ts">
type Props = {
  isOverlay?: boolean;
};

const { isOverlay = false } = defineProps<Props>();
</script>

<template>
  <div :class="isOverlay ? 'modal-overlay' : 'modal-inline'">
    <div class="modal-container">
      <div class="modal-header">
        <slot name="header"></slot>
      </div>

      <div class="modal-body">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
p {
  font-family: Inter;
  font-size: 16px;
  font-stretch: normal;
  line-height: 1.32;
  color: var(--text-icon-secondary);
}
</style>
