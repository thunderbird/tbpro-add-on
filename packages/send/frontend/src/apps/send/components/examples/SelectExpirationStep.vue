<script setup lang="ts">
import { computed, ref } from 'vue';
import FileUploadTemplate from '../FileUploadTemplate.vue';

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'create'): void;
  (e: 'close'): void;
}>();

type ExpirationOption = 'never' | '24hours' | '14days' | '30days' | 'custom';

const selectedExpiration = ref<ExpirationOption>('14days');
const customDate = ref('03/30/2026');
const customTime = ref('12:30 PM');

const isCustomSelected = computed(() => {
  return selectedExpiration.value === 'custom';
});
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
    @close="emit('close')"
    @back="emit('back')"
    @primary="emit('create')"
  >
    <!-- Description -->
    <p class="description">Choose when the download link expires</p>

    <!-- Radio Options -->
    <div class="radio-group">
      <!-- Never expire -->
      <label class="radio-option">
        <input
          v-model="selectedExpiration"
          type="radio"
          name="expiration"
          value="never"
          class="radio-input"
        />
        <span class="radio-label">Never expire</span>
      </label>

      <!-- Expire in 24 hours -->
      <label class="radio-option">
        <input
          v-model="selectedExpiration"
          type="radio"
          name="expiration"
          value="24hours"
          class="radio-input"
        />
        <span class="radio-label">Expire in 24 hours</span>
      </label>

      <!-- Expire in 14 days (default) -->
      <label class="radio-option">
        <input
          v-model="selectedExpiration"
          type="radio"
          name="expiration"
          value="14days"
          class="radio-input"
        />
        <span class="radio-label">Expire in 14 days (default)</span>
      </label>

      <!-- Expire in 30 days -->
      <label class="radio-option">
        <input
          v-model="selectedExpiration"
          type="radio"
          name="expiration"
          value="30days"
          class="radio-input"
        />
        <span class="radio-label">Expire in 30 days</span>
      </label>

      <!-- Select date and time -->
      <label class="radio-option">
        <input
          v-model="selectedExpiration"
          type="radio"
          name="expiration"
          value="custom"
          class="radio-input"
        />
        <span class="radio-label">Select date and time</span>
      </label>
    </div>

    <!-- Custom Date/Time Pickers -->
    <div v-if="isCustomSelected" class="custom-datetime">
      <div class="datetime-fields">
        <div class="field-group">
          <label for="select-date" class="field-label">Select date</label>
          <input
            id="select-date"
            v-model="customDate"
            type="text"
            class="input-field"
            placeholder="MM/DD/YYYY"
          />
        </div>

        <div class="field-group">
          <label for="select-time" class="field-label">Select time</label>
          <input
            id="select-time"
            v-model="customTime"
            type="text"
            class="input-field"
            placeholder="HH:MM AM/PM"
          />
        </div>
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

.datetime-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
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

.input-field::placeholder {
  color: #9ca3af;
}

@media (max-width: 640px) {
  .datetime-fields {
    grid-template-columns: 1fr;
  }

  .custom-datetime {
    padding-left: 1.5rem;
  }
}
</style>
