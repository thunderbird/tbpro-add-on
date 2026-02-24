<script setup lang="ts">
import { useRouter } from 'vue-router';
import KeysTemplate from './KeysTemplate.vue';
import ProButton from '@send-frontend/apps/common/ProButton.vue';

const router = useRouter();
</script>

<template>
  <KeysTemplate>
    <div class="">
      <div class="" style="margin-bottom: 32px">
        <h1 class="title">Security & Privacy</h1>

        <div class="description">
          <h3>Manage Encryption Key</h3>
          <p>
            Download a backup of your active encryption key, or reset your
            account if your key becomes locked or inaccessible.
          </p>
        </div>

        <ProButton
          data-testid="recover-access-button"
          @click="() => router.push('/send/security-and-privacy')"
        >
          Encryption Key
        </ProButton>
      </div>
    </div>
  </KeysTemplate>
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
h3 {
  font-weight: 700;
}

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

.recover-access {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: white;
  background-color: #0a84ff;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: background-color 0.2s;
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
