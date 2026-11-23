<script setup lang="ts">
import { useL10n } from '@send-frontend/l10n';
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

const { t } = useL10n();

const showStepIndicator = computed(() => {
  return props.step && props.step.totalSteps > 1;
});

const stepText = computed(() => {
  if (!props.step) return '';
  return t('send-upload-step-indicator', {
    current: props.step.stepNumber,
    total: props.step.totalSteps,
  });
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
        {{ secondaryButtonText || t('send-upload-button-back') }}
      </button>

      <button
        v-if="showSecondaryButton && !showBackButton"
        class="button button-secondary"
        data-test="secondary-button"
        @click="emit('secondary')"
      >
        {{ secondaryButtonText || t('send-upload-button-cancel') }}
      </button>

      <button
        v-if="showPrimaryButton"
        class="button button-primary"
        data-test="primary-button"
        :disabled="primaryButtonDisabled || isLoading"
        @click="emit('primary')"
      >
        <span v-if="isLoading" class="loading-spinner"></span>
        <span>{{ primaryButtonText || t('send-upload-button-next') }}</span>
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
  border-bottom: 1px solid var(--colour-surface-border);
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
  color: var(--colour-ti-muted);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.modal-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--colour-ti-base);
  line-height: 1.3;
  margin: 0;
}

.modal-content {
  padding: 1.5rem 2rem;
  flex: 1;
}

.error-banner {
  background-color: var(--colour-critical-soft);
  border: 1px solid var(--colour-critical-soft);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

.error-text {
  color: var(--colour-ti-critical);
  font-size: 0.875rem;
  font-weight: 500;
}

.modal-footer {
  padding: 1.25rem 2rem 1.5rem;
  border-top: 1px solid var(--colour-surface-border);
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
  background: var(--colour-surface-raised);
  color: var(--colour-ti-secondary);
  border: 1px solid var(--colour-surface-border);
}

.button-secondary:hover:not(:disabled) {
  background: var(--colour-surface-lower);
  border-color: var(--colour-surface-border-intense);
}

.button-primary {
  background: var(--colour-primary-default);
  color: var(--colour-ti-base-inverted);
}

.button-primary:hover:not(:disabled) {
  background: var(--colour-primary-hover);
}

.loading-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: var(--colour-surface-raised);
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
