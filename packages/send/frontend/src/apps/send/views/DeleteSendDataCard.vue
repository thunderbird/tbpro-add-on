<script setup lang="ts">
import EyeIcon from '@send-frontend/apps/common/EyeIcon.vue';
import EyeOffIcon from '@send-frontend/apps/common/EyeOffIcon.vue';
import { DangerButton } from '@thunderbirdops/services-ui';
import { parsePassphrase } from '@send-frontend/lib/passphraseUtils';
import { computed, ref } from 'vue';
import KeysTemplate from './KeysTemplate.vue';

type Props = {
  storedPassphrase: string;
};

const { storedPassphrase } = defineProps<Props>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const understood = ref(false);
const password = ref('');
const isPasswordVisible = ref(false);
const validationError = ref('');

const canDelete = computed(() => {
  return understood.value && password.value.trim().length > 0;
});

const togglePasswordVisibility = () => {
  isPasswordVisible.value = !isPasswordVisible.value;
};

const confirmDeletion = () => {
  if (!canDelete.value) {
    return;
  }

  try {
    const parsedInput = parsePassphrase(password.value);
    const parsedStored = parsePassphrase(storedPassphrase);
    if (parsedInput !== parsedStored) {
      validationError.value = 'Passphrase does not match. Please try again.';
      return;
    }
  } catch (error) {
    validationError.value =
      error instanceof Error ? error.message : 'Invalid passphrase format';
    return;
  }

  validationError.value = '';
  emit('confirm');
};
</script>

<template>
  <KeysTemplate>
    <div class="delete-card">
      <h1 class="title">Delete Send Data</h1>

      <p class="description strong">
        This will permanently delete all encrypted files in your Thunderbird Pro
        Send storage.
      </p>

      <p class="description">
        Your Thunderbird Pro subscription will not be affected.
      </p>

      <p class="description">
        Be sure to export any files you want to keep before continuing.
      </p>

      <div class="checkbox-container">
        <input
          id="delete-understand-checkbox"
          v-model="understood"
          data-testid="delete-understand-checkbox"
          type="checkbox"
          class="checkbox"
        />
        <label for="delete-understand-checkbox" class="checkbox-label">
          I understand my encrypted files will be permanently deleted.
          <span class="required">*</span>
        </label>
      </div>

      <label class="password-label" for="delete-password">
        Enter your password to confirm <span class="required">*</span>
      </label>

      <div class="actions">
        <div class="password-input-container">
          <input
            id="delete-password"
            v-model="password"
            data-testid="delete-password"
            :type="isPasswordVisible ? 'text' : 'password'"
            placeholder="Your passphrase goes here"
            class="password-input light"
          />
          <button
            class="icon-button"
            :title="isPasswordVisible ? 'Hide password' : 'Show password'"
            :aria-label="isPasswordVisible ? 'Hide password' : 'Show password'"
            @click="togglePasswordVisibility"
          >
            <EyeIcon v-if="isPasswordVisible" />
            <EyeOffIcon v-else />
          </button>
        </div>

        <DangerButton
          data-testid="delete-send-data"
          :disabled="!canDelete"
          @click="confirmDeletion"
        >
          Delete Send Data
        </DangerButton>
      </div>

      <div v-if="validationError" class="error-field">
        {{ validationError }}
      </div>

      <button class="cancel-link light" @click="emit('cancel')">Cancel</button>
    </div>
  </KeysTemplate>
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';

.delete-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.title {
  margin-bottom: 0.5rem;
}

.description,
.password-label {
  font-family: Inter;
  font-size: 14px;
  line-height: 1.23;
  color: var(--text-icon-secondary);
}

.description {
  margin: 0;
}

.strong {
  font-weight: 700;
}

.checkbox-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.checkbox {
  width: 1.25rem;
  height: 1.25rem;
  margin: 0;
}

.checkbox-label {
  color: var(--text-icon-secondary);
  font-size: 1rem;
}

.required {
  color: var(--text-icon-critical);
}

.error-field {
  color: var(--colour-danger-default);
  margin-top: 0.25rem;
}

.password-label {
  margin-top: 0.5rem;
}

.actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.25rem;
}

.password-input-container {
  display: flex;
  align-items: center;
  width: 100%;
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  background: white;
  padding-right: 0.5rem;
  max-width: 380px;
}

.password-input {
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  padding: 0.75rem;
  color: var(--text-icon-secondary);
  font-size: 1rem;
}

.password-input::placeholder {
  color: var(--text-icon-muted);
}

.icon-button {
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-icon-secondary);
}

.cancel-link {
  margin-left: auto;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  font-family: Inter;
  font-size: 12px;
  line-height: normal;
  color: var(--text-icon-highlight);
  text-decoration: underline;
}

@media (max-width: 1024px) {
  .actions {
    flex-direction: column;
    align-items: stretch;
  }
  .password-input-container {
    max-width: 100%;
  }
}
</style>
