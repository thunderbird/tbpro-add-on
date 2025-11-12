<script setup lang="ts">
import { VueFinalModal } from 'vue-final-modal';

defineProps<{
  title?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', modelValue: boolean): void;
}>();
</script>

<template>
  <VueFinalModal
    class="flex justify-center items-center"
    content-class="flex flex-col p-4 bg-white rounded border border-gray-100"
    @update:model-value="(val) => emit('update:modelValue', val)"
  >
    <div class="flex items-center h-10 relative">
      <button
        class="close-button"
        aria-label="Close"
        @click="emit('update:modelValue', false)"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <slot></slot>
  </VueFinalModal>
</template>

<style scoped>
.close-button {
  position: absolute;
  top: 0;
  right: 0;
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.close-button:hover {
  background: #f0f0f0;
  color: #333;
}
</style>
