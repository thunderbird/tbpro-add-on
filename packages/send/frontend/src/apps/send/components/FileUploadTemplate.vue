<script setup lang="ts">
import { computed } from 'vue';

export interface ModalStep {
  stepNumber: number;
  totalSteps: number;
  title: string;
}

const props = defineProps<{
  step?: ModalStep;
  showCloseButton?: boolean;
  showBackButton?: boolean;
  showPrimaryButton?: boolean;
  primaryButtonText?: string;
  primaryButtonDisabled?: boolean;
  showSecondaryButton?: boolean;
  secondaryButtonText?: string;
  isLoading?: boolean;
  errorMessage?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'back'): void;
  (e: 'primary'): void;
  (e: 'secondary'): void;
}>();

const showStepIndicator = computed(() => {
  return props.step && props.step.totalSteps > 1;
});

const stepText = computed(() => {
  if (!props.step) return '';
  return `STEP ${props.step.stepNumber} OF ${props.step.totalSteps}`;
});
</script>

<template>
  <div class="modal-container">
    <!-- Header -->
    <div class="modal-header">
      <div class="header-content">
        <div class="header-left">
          <div v-if="showStepIndicator" class="step-indicator">
            {{ stepText }}
          </div>
          <h2 class="modal-title">
            {{ step?.title || '' }}
          </h2>
        </div>
      </div>
    </div>

    <!-- Content Area -->
    <div class="modal-content">
      <!-- Error Message -->
      <div v-if="errorMessage" class="error-banner">
        <span class="error-text">{{ errorMessage }}</span>
      </div>

      <!-- Main Content Slot -->
      <slot></slot>
    </div>

    <!-- Footer with Action Buttons -->
    <div class="modal-footer">
      <button
        v-if="showBackButton"
        class="button button-secondary"
        data-test="back-button"
        @click="emit('back')"
      >
        {{ secondaryButtonText || 'Back' }}
      </button>

      <button
        v-if="showSecondaryButton && !showBackButton"
        class="button button-secondary"
        data-test="secondary-button"
        @click="emit('secondary')"
      >
        {{ secondaryButtonText || 'Cancel' }}
      </button>

      <button
        v-if="showPrimaryButton"
        class="button button-primary"
        data-test="primary-button"
        :disabled="primaryButtonDisabled || isLoading"
        @click="emit('primary')"
      >
        <span v-if="isLoading" class="loading-spinner"></span>
        <span>{{ primaryButtonText || 'Next' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.modal-container {
  width: 100%;
  max-width: 580px;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.modal-header {
  padding: 1.5rem 2rem 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.header-content {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.header-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.step-indicator {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.modal-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  line-height: 1.3;
  margin: 0;
}

.modal-content {
  padding: 1.5rem 2rem;
  flex: 1;
}

.error-banner {
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.error-text {
  color: #dc2626;
  font-size: 0.875rem;
  font-weight: 500;
}

.modal-footer {
  padding: 1.25rem 2rem 1.5rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.button {
  padding: 0.625rem 1.25rem;
  font-size: 0.9375rem;
  font-weight: 600;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 100px;
  justify-content: center;
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button-secondary {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}

.button-secondary:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #9ca3af;
}

.button-primary {
  background: #0060df;
  color: white;
}

.button-primary:hover:not(:disabled) {
  background: #0050c8;
}

.loading-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Responsive adjustments */
@media (max-width: 640px) {
  .modal-container {
    max-width: 100%;
    margin: 0.5rem;
    max-height: calc(100vh - 1rem);
  }

  .modal-header {
    padding: 1.25rem 1.5rem 0.875rem;
  }

  .modal-content {
    padding: 1.25rem 1.5rem;
  }

  .modal-footer {
    padding: 1rem 1.5rem 1.25rem;
    flex-direction: column-reverse;
  }

  .button {
    width: 100%;
  }

  .modal-title {
    font-size: 1.25rem;
  }
}
</style>
