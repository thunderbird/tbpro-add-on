<script setup lang="ts">
import { computed } from 'vue';
import FileUploadTemplate from '../FileUploadTemplate.vue';

type ExpirationOption = 'never' | '24hours' | '14days' | '30days' | 'custom';

interface Props {
  selectedExpiration: ExpirationOption;
  customDateTime: string;
  isExtension: boolean;
}

interface Emits {
  (e: 'update:selectedExpiration', value: ExpirationOption): void;
  (e: 'update:customDateTime', value: string): void;
  (e: 'back'): void;
  (e: 'close'): void;
  (e: 'createLink'): void;
  (e: 'setExpiredForTesting'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isCustomSelected = computed(() => {
  return props.selectedExpiration === 'custom';
});

function handleBack() {
  emit('back');
}

function handleClose() {
  emit('close');
}

function handleCreateLink() {
  emit('createLink');
}

function updateSelectedExpiration(value: ExpirationOption) {
  emit('update:selectedExpiration', value);
}

function updateCustomDateTime(value: string) {
  emit('update:customDateTime', value);
}

function handleSetExpiredForTesting() {
  emit('setExpiredForTesting');
}
</script>

<template>
  <FileUploadTemplate
    :step="{
      stepNumber: 2,
      totalSteps: 2,
      title: 'Select File Expiration',
    }"
    :show-close-button="true"
    :show-back-button="true"
    :show-primary-button="true"
    primary-button-text="Create Link"
    back-button-text="Back"
    @close="handleClose"
    @back="handleBack"
    @primary="handleCreateLink"
  >
    <!-- Description -->
    <p class="description">Choose when the download link expires</p>

    <!-- Radio Options -->
    <div class="radio-group">
      <!-- Never expire -->
      <label class="radio-option">
        <input
          :checked="selectedExpiration === 'never'"
          type="radio"
          name="expiration"
          value="never"
          class="radio-input"
          @change="updateSelectedExpiration('never')"
        />
        <span class="radio-label">Never expire</span>
      </label>

      <!-- Expire in 24 hours -->
      <label class="radio-option">
        <input
          :checked="selectedExpiration === '24hours'"
          type="radio"
          name="expiration"
          value="24hours"
          class="radio-input"
          @change="updateSelectedExpiration('24hours')"
        />
        <span class="radio-label">Expire in 24 hours</span>
      </label>

      <!-- Expire in 14 days (default) -->
      <label class="radio-option">
        <input
          :checked="selectedExpiration === '14days'"
          type="radio"
          name="expiration"
          value="14days"
          class="radio-input"
          @change="updateSelectedExpiration('14days')"
        />
        <span class="radio-label">Expire in 14 days (default)</span>
      </label>

      <!-- Expire in 30 days -->
      <label class="radio-option">
        <input
          :checked="selectedExpiration === '30days'"
          type="radio"
          name="expiration"
          value="30days"
          class="radio-input"
          @change="updateSelectedExpiration('30days')"
        />
        <span class="radio-label">Expire in 30 days</span>
      </label>

      <!-- Select date and time -->
      <label class="radio-option">
        <input
          :checked="selectedExpiration === 'custom'"
          type="radio"
          name="expiration"
          value="custom"
          class="radio-input"
          @change="updateSelectedExpiration('custom')"
        />
        <span class="radio-label">Select date and time</span>
      </label>
    </div>

    <!-- Custom Date/Time Picker -->
    <div v-if="isCustomSelected" class="custom-datetime">
      <div class="field-group">
        <label for="select-datetime" class="field-label">
          Select date and time
        </label>
        <input
          id="select-datetime"
          :value="customDateTime"
          type="datetime-local"
          class="input-field"
          @input="
            updateCustomDateTime(($event.target as HTMLInputElement).value)
          "
        />
      </div>
    </div>

    <!-- Testing button (only visible on web, not in extension) -->
    <button
      v-if="!isExtension"
      type="button"
      class="test-expired-button"
      @click="handleSetExpiredForTesting"
    >
      🧪 Set Expired (10 days ago) - For Testing
    </button>
  </FileUploadTemplate>
</template>

<style scoped>
.description {
  color: #4b5563;
  font-size: 0.9375rem;
  line-height: 1.5;
  margin-bottom: 1.5rem;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  padding: 0.5rem 0;
}

.radio-input {
  width: 1.125rem;
  height: 1.125rem;
  cursor: pointer;
  accent-color: #0060df;
  margin: 0;
  flex-shrink: 0;
}

.radio-label {
  font-size: 0.9375rem;
  color: #374151;
  line-height: 1.5;
}

.custom-datetime {
  margin-top: 1rem;
  padding-left: 2rem;
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

.input-field {
  width: 100%;
  padding: 0.625rem 0.875rem;
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

.test-expired-button {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.test-expired-button:hover {
  background: #fde68a;
  border-color: #fbbf24;
}

@media (max-width: 640px) {
  .custom-datetime {
    padding-left: 1.5rem;
  }
}
</style>
