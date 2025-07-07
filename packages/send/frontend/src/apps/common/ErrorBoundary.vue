<script setup>
import { onErrorCaptured, ref } from 'vue';
import FeedbackBox from './FeedbackBox.vue';
import Modal from './ModalComponent.vue';

const hasError = ref(false);
const error = ref(null);

onErrorCaptured((err) => {
  // We explicitly check for DEBUG mode to decide whether to display the error or log it to the console.
  const shouldDisplayError = import.meta.env.DEBUG;
  hasError.value = true;
  error.value = err;
  return shouldDisplayError;
});

const reload = () => {
  hasError.value = false;
  error.value = null;
};
</script>

<template>
  <div>
    <Modal v-if="hasError" @close="reload">
      <p>An error occurred: {{ error.message }}</p>
      <FeedbackBox />
    </Modal>
    <div v-else>
      <slot></slot>
    </div>
  </div>
</template>
