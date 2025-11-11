<script setup lang="ts">
import { useKeychainStore } from '@send-frontend/stores';
import KeysTemplate from './KeysTemplate.vue';

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const { keychain } = useKeychainStore();

const passphraseFromLocalStorage = keychain.getPassphraseValue();
</script>

<template>
  <div class="keys-container">
    <KeysTemplate>
      <div class="key-section">
        <h2 class="section-title">Manage Encryption Key</h2>

        <p class="section-description">
          This key restores your profile when you sign in on a new device. Your
          files are always encrypted locally, and the key is never stored on our
          servers. Save or download it to a secure place for future use.
        </p>

        <div class="key-field">
          <label class="key-label">
            Encryption Key <span class="required">*</span>
          </label>
          <div class="key-input-container">
            <input
              type="text"
              :value="passphraseFromLocalStorage"
              readonly
              class="key-input"
            />
            <button class="icon-button" title="Toggle visibility">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            <button class="icon-button" title="Copy to clipboard">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path
                  d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                />
              </svg>
            </button>
            <button class="icon-button" title="Download key">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </KeysTemplate>

    <KeysTemplate>
      <div class="key-section reset-section">
        <h2 class="">Reset Encryption Key</h2>

        <p class="section-description">
          Resetting your encryption key permanently removes all files and clears
          your encrypted storage. This action cannot be undone.
        </p>

        <button
          data-testid="show-reset"
          class="reset-button"
          @click="emit('confirm')"
        >
          Reset encryption key
        </button>
      </div>
    </KeysTemplate>
  </div>
</template>

<style scoped>
.keys-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.reset-section {
  background-color: white;
}

.section-description {
  color: #6b7280;
  font-size: 0.875rem;
  line-height: 1.5;
  margin-bottom: 1.5rem;
}

.key-field {
  margin-top: 1rem;
}

.key-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
}

.required {
  color: #dc2626;
}

.key-input-container {
  display: flex;
  align-items: center;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background-color: #f9fafb;
  padding: 0.5rem;
  gap: 0.5rem;
}

.key-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-family: monospace;
  font-size: 0.875rem;
  color: #374151;
}

.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  border-radius: 0.25rem;
  transition: all 0.2s;
}

.icon-button:hover {
  color: #374151;
  background-color: #e5e7eb;
}

.reset-button {
  padding: 0.625rem 1.25rem;
  background-color: #dc2626;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.reset-button:hover {
  background-color: #b91c1c;
}

.reset-button:active {
  background-color: #991b1b;
}
</style>
