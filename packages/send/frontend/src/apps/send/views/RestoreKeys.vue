<script setup lang="ts">
import { ref } from 'vue';
import KeysTemplate from './KeysTemplate.vue';
import ProButton from '@send-frontend/apps/common/ProButton.vue';
import { parsePassphrase } from '@send-frontend/lib/passphraseUtils';

type Props = {
  restoreFromBackup: () => void;
  setPassphrase: (newPassphrase: string) => void;
  message?: string;
  onReset?: () => void;
};

const { restoreFromBackup, setPassphrase, message } = defineProps<Props>();

const encryptionKey = ref('');
const validationError = ref('');
const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'continue'): void;
}>();

const onCancel = () => {
  emit('cancel');
  //close modal
};

const onContinue = async () => {
  if (!encryptionKey.value.trim()) {
    return;
  }

  try {
    const parsedPassphrase = parsePassphrase(encryptionKey.value);
    validationError.value = '';
    setPassphrase(parsedPassphrase);
    restoreFromBackup();
    emit('continue');
  } catch (error) {
    validationError.value =
      error instanceof Error ? error.message : 'Invalid passphrase format';
  }
};
</script>

<template>
  <KeysTemplate>
    <div class="">
      <div class="" style="margin-bottom: 32px">
        <h2 class="title">Recover Access with Your Encryption Key</h2>

        <div class="description">
          <p>
            Enter your encryption key to verify your identity to access
            encrypted files and be able to upload new files.
          </p>
        </div>

        <div class="input-group">
          <label class="input-label">
            Enter Encryption Key code <span class="required">*</span>
          </label>
          <div class="input-container">
            <input
              v-model="encryptionKey"
              type="text"
              class="passphrase-input"
              placeholder="text - text - text - text"
              data-testid="restore-key-input"
            />
          </div>
        </div>
        <div class="error-field">{{ validationError || message }}</div>
        <div class="button-group">
          <ProButton
            class="continue-button"
            data-testid="restore-keys-button"
            :disabled="!encryptionKey.trim()"
            @click="onContinue"
          >
            Continue
          </ProButton>
          <ProButton
            :type="'secondary'"
            class="cancel-button"
            data-testid="cancel-restore-button"
            @click="onCancel"
          >
            Cancel
          </ProButton>
        </div>
      </div>
      <button
        v-if="onReset"
        data-testid="reset-access"
        class="reset-access"
        @click="onReset"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
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
        Reset Access
      </button>
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

.input-group {
  margin-bottom: 2rem;
}

.input-label {
  display: block;
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: #1f2937;
  font-size: 0.875rem;
}

.required {
  color: #ef4444;
}

.error-field {
  color: var(--colour-danger-default);
  margin-bottom: 1rem;
}

.input-container {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: white;
  overflow: hidden;
}

.input-container:focus-within {
  border-color: #3b82f6;
  outline: 2px solid #3b82f614;
}

.passphrase-input {
  flex: 1;
  padding: 0.75rem 1rem;
  border: none;
  background: transparent;
  font-size: 1rem;
  color: #1f2937;
  outline: none;
}

.passphrase-input::placeholder {
  color: #9ca3af;
}

.button-group {
  display: flex;
  gap: 1rem;
  justify-content: space-between;
}

.continue-button {
  padding: 0.75rem 2rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.continue-button:hover:not(:disabled) {
  background: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
}

.continue-button:active:not(:disabled) {
  transform: translateY(0);
}

.continue-button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
  opacity: 0.5;
}

.cancel-button {
  padding: 0.75rem 2rem;
  background: white;
  color: #3b82f6;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-button:hover {
  background: #eff6ff;
}

.cancel-button:active {
  transform: translateY(0);
}

.reset-access {
  bottom: 0.75rem;
  right: 0.75rem;
  display: flex;
  align-items: end;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  color: #92400e;
  background-color: transparent;
  border: 1px solid #92400e;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.reset-access:hover {
  background-color: #fde68a;
}

.reset-access svg {
  width: 16px;
  height: 16px;
}

@media (max-width: 768px) {
  .button-group {
    flex-direction: column-reverse;
  }

  .continue-button,
  .cancel-button {
    width: 100%;
  }
}
</style>
