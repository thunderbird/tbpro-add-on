<script setup lang="ts">
import { DangerButton } from '@thunderbirdops/services-ui';
import { ref } from 'vue';
import KeysTemplate from './KeysTemplate.vue';
import PassphraseField from './PassphraseField.vue';

type Props = {
  words: string[];
  regeneratePassphrase: () => void;
  canRegenerate?: boolean;
  errorMessage?: string;
  saving?: boolean;
};

const {
  canRegenerate = true,
  errorMessage = '',
  saving = false,
} = defineProps<Props>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const understood = ref(false);

const confirm = () => {
  if (understood.value && !saving) {
    emit('confirm');
  }
};
</script>

<template>
  <KeysTemplate :is-overlay="true">
    <div class="modal-content">
      <h1 class="title">Reset Encryption Key</h1>

      <div class="description">
        <p>
          This is your new encryption key. Save a copy in a safe place: it's
          never stored on our servers and cannot be recovered if lost.
        </p>
        <p class="mt-2">
          Your current key stays active until you click
          <strong>Download key and reset</strong>. After that, files encrypted
          with your previous key will no longer be accessible.
        </p>
      </div>

      <PassphraseField
        :words="words"
        :regenerate-passphrase="regeneratePassphrase"
        :can-regenerate="canRegenerate"
        label="New Encryption Key"
        input-test-id="reset-key-passphrase"
      />

      <p
        v-if="errorMessage"
        class="error-field"
        role="alert"
        data-testid="reset-key-error"
      >
        {{ errorMessage }}
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
          type="button"
          class="cancel-button"
          :disabled="saving"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <DangerButton
          :disabled="!understood || saving"
          data-testid="danger-button"
          @click="confirm"
        >
          Download key and reset
        </DangerButton>
      </div>
    </div>
  </KeysTemplate>
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
.description {
  margin-bottom: 2rem;
  line-height: 1.6;
  color: #1f2937;
}

.mt-2 {
  margin-top: 0.5rem;
}

.error-field {
  color: var(--colour-danger-default);
  margin-bottom: 1rem;
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

.cancel-button:hover:not(:disabled) {
  background-color: #eff6ff;
}

.cancel-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
