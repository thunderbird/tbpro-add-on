<script setup lang="ts">
import { IconEye, IconEyeClosed } from '@tabler/icons-vue';
import { computed, ref } from 'vue';
import FileUploadTemplate from '../FileUploadTemplate.vue';

const emit = defineEmits<{
  (e: 'next', password: string): void;
  (e: 'close'): void;
}>();

const password = ref('');
const passwordHint = ref('');
const isPasswordProtected = ref(false);
const passwordFieldType = ref<'password' | 'text'>('password');

const isPasswordVisible = computed(() => {
  return passwordFieldType.value === 'text';
});

const canProceed = computed(() => {
  return !isPasswordProtected.value || password.value.length > 0;
});

function togglePasswordVisibility() {
  passwordFieldType.value =
    passwordFieldType.value === 'password' ? 'text' : 'password';
}

function handleNext() {
  emit('next', isPasswordProtected.value ? password.value : '');
}
</script>

<template>
  <FileUploadTemplate
    :step="{
      stepNumber: 1,
      totalSteps: 2,
      title: 'Create File Password',
    }"
    :show-close-button="true"
    :show-primary-button="true"
    primary-button-text="Next"
    :primary-button-disabled="!canProceed"
    @close="emit('close')"
    @primary="handleNext"
  >
    <!-- Description -->
    <p class="description">
      A file password provides an extra layer of security in case your email is
      accessed by an unintended recipient.
    </p>

    <!-- Checkbox to enable password protection -->
    <div class="checkbox-container">
      <input
        id="password-checkbox"
        v-model="isPasswordProtected"
        type="checkbox"
        class="checkbox"
      />
      <label for="password-checkbox" class="checkbox-label">
        Protect this file with a password (recommended)
      </label>
    </div>

    <!-- Password Fields (shown when checkbox is checked) -->
    <div v-if="isPasswordProtected" class="form-fields">
      <!-- Password Input -->
      <div class="field-group">
        <label for="file-password" class="field-label">
          File Password <span class="required">*</span>
        </label>
        <div class="password-input-wrapper">
          <input
            id="file-password"
            v-model="password"
            :type="passwordFieldType"
            class="input-field"
            placeholder="Enter password"
            autocomplete="new-password"
          />
          <button
            type="button"
            class="password-toggle"
            :aria-label="isPasswordVisible ? 'Hide password' : 'Show password'"
            @click="togglePasswordVisibility"
          >
            <IconEye v-if="!isPasswordVisible" :size="20" />
            <IconEyeClosed v-if="isPasswordVisible" :size="20" />
          </button>
        </div>
        <p class="field-help">
          Share this password with your recipient using a separate communication
          channel.
        </p>
      </div>

      <!-- Password Hint -->
      <div class="field-group">
        <label for="password-hint" class="field-label">Password Hint</label>
        <input
          id="password-hint"
          v-model="passwordHint"
          type="text"
          class="input-field"
          placeholder="best open source email ever eevee"
        />
        <p class="field-help">
          Enter a password hint to help your recipient know. For instance, "The
          first ten letters of your last name and all four letters of your phone
          number"
        </p>
      </div>
    </div>
  </FileUploadTemplate>
</template>

<style scoped>
.description {
  color: #4b5563;
  font-size: 0.9375rem;
  line-height: 1.5;
  margin-bottom: 1.5rem;
}

.checkbox-container {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.checkbox {
  margin-top: 0.125rem;
  width: 1.125rem;
  height: 1.125rem;
  cursor: pointer;
  accent-color: #0060df;
}

.checkbox-label {
  font-size: 0.9375rem;
  font-weight: 500;
  color: #111827;
  cursor: pointer;
  line-height: 1.5;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-top: 1rem;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.required {
  color: #dc2626;
}

.password-input-wrapper {
  position: relative;
}

.input-field {
  width: 100%;
  padding: 0.625rem 2.75rem 0.625rem 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.9375rem;
  color: #111827;
  transition: all 0.2s ease;
}

.input-field:focus {
  outline: none;
  border-color: #0060df;
  box-shadow: 0 0 0 3px rgba(0, 96, 223, 0.1);
}

.input-field::placeholder {
  color: #9ca3af;
}

.password-toggle {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.password-toggle:hover {
  color: #374151;
  background: #f3f4f6;
}

.field-help {
  font-size: 0.8125rem;
  color: #6b7280;
  line-height: 1.4;
  margin: 0;
}
</style>
