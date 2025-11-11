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
