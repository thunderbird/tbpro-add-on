<script setup lang="ts">
import { DangerButton } from '@thunderbirdops/services-ui';
import { ref } from 'vue';
import KeysTemplate from './KeysTemplate.vue';

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const understood = ref(false);

const createNewKey = () => {
  if (understood.value) {
    emit('confirm');
  }
};
</script>
<template>
  <KeysTemplate :is-overlay="true" class="overlay">
    <div class="modal-content">
      <h1 class="title">Reset Encryption Key</h1>

      <p class="description">
        Creating a new key will replace your existing one. You'll be able to
        upload and send new files, but files encrypted with your previous key
        will no longer be accessible.
      </p>

      <div class="checkbox-container">
        <input
          id="understand-checkbox"
          v-model="understood"
          data-testid="understand-checkbox"
          type="checkbox"
          class="checkbox"
        />
        <label for="understand-checkbox" class="checkbox-label">
          I understand I'll lose access to my old files.
        </label>
      </div>

      <div class="actions">
        <button
          data-testid="danger-button"
          class="cancel-button"
          @click="$emit('cancel')"
        >
          Cancel
        </button>
        <DangerButton :disabled="!understood" @click="createNewKey">
          Create new encryption key
        </DangerButton>
      </div>
    </div>
  </KeysTemplate>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal-content {
  background-color: white;
  border-radius: 0.5rem;
  /* max-width: 32rem; */
  width: 100%;
  margin: 0 1rem;
  padding: 1.5rem;
}

.title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1rem;
}

.description {
  color: #4b5563;
  margin-bottom: 1.5rem;
}

.checkbox-container {
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
}

.checkbox {
  width: 1rem;
  height: 1rem;
  color: #2563eb;
  border-color: #d1d5db;
  border-radius: 0.25rem;
}

.checkbox:focus {
  ring: 2px;
  ring-color: #3b82f6;
}

.checkbox-label {
  margin-left: 0.5rem;
  font-size: 0.875rem;
  color: #374151;
}

.actions {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.cancel-button {
  padding: 0.5rem 1rem;
  color: #2563eb;
  border: 1px solid #2563eb;
  border-radius: 0.25rem;
  background-color: transparent;
  transition: background-color 0.2s;
  cursor: pointer;
}

.cancel-button:hover {
  background-color: #eff6ff;
}
</style>
