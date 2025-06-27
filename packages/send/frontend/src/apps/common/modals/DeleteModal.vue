<script setup lang="ts">
import { VueFinalModal } from 'vue-final-modal';
import CloseIcon from '../CloseIcon.vue';

defineProps<{
  title?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', modelValue: boolean): void;
}>();
</script>

<template>
  <VueFinalModal
    content-class="flex flex-col p-4 bg-white rounded border border-gray-100 modal-body"
    data-testid="delete-modal"
    @update:model-value="(val) => emit('update:modelValue', val)"
  >
    <div class="flex items-center h-10">
      <h1 v-if="title" class="text-2xl">
        {{ title }}
      </h1>
      <button class="ml-auto" @click="emit('update:modelValue', false)">
        <CloseIcon />
      </button>
    </div>
    <slot></slot>
  </VueFinalModal>
</template>

<style>
.modal-body {
  max-width: 50%;
  margin: auto;
  padding: 20px;
  background-color: white;
  border-radius: 8px;
}
</style>
