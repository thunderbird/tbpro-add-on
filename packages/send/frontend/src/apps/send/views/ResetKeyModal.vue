<script setup lang="ts">
import { DangerButton, ModalDialog } from '@thunderbirdops/services-ui';
import { useL10n } from '@send-frontend/l10n';
import { nextTick, onMounted, ref, useTemplateRef } from 'vue';
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

const { t, tAround } = useL10n();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const understood = ref(false);

// ModalDialog renders nothing until show() is called and closes itself on
// the × button or an outside click; we translate that into our cancel event.
const modal = useTemplateRef<InstanceType<typeof ModalDialog>>('modal');
const body = useTemplateRef<HTMLElement>('body');

onMounted(async () => {
  modal.value?.show();
  await nextTick();
  body.value?.focus();
});

const cancel = () => {
  if (!saving) emit('cancel');
};

const onClosed = () => {
  if (saving) {
    // The swap is in flight; keep the dialog up until it settles.
    modal.value?.show();
    return;
  }
  emit('cancel');
};

const confirm = () => {
  if (understood.value && !saving) {
    emit('confirm');
  }
};
</script>

<template>
  <ModalDialog
    ref="modal"
    :close-outside="!saving"
    data-testid="reset-key-modal"
    @closed="onClosed"
  >
    <template #header>
      <!-- ModalDialog styles the header and labels itself with aria-labelledby="title" -->
      <span id="title">{{ t('send-keys-reset-title') }}</span>
    </template>

    <div ref="body" class="reset-key-body" tabindex="-1" @keydown.esc="cancel">
      <div class="description">
        <p>{{ t('send-keys-reset-new-key') }}</p>
        <p class="mt-2">
          {{ tAround('send-keys-reset-stays-active', 'button')[0]
          }}<strong>{{ t('send-keys-reset-confirm') }}</strong
          >{{ tAround('send-keys-reset-stays-active', 'button')[1] }}
        </p>
      </div>

      <PassphraseField
        :words="words"
        :regenerate-passphrase="regeneratePassphrase"
        :can-regenerate="canRegenerate"
        :label="t('send-keys-reset-new-key-label')"
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
          {{ t('send-keys-reset-understand') }}
        </label>
      </div>
    </div>

    <template #actions>
      <div class="actions">
        <button
          type="button"
          class="cancel-button"
          :disabled="saving"
          @click="cancel"
        >
          {{ t('send-keys-reset-cancel') }}
        </button>
        <DangerButton
          :disabled="!understood || saving"
          data-testid="danger-button"
          @click="confirm"
        >
          {{ t('send-keys-reset-confirm') }}
        </DangerButton>
      </div>
    </template>
  </ModalDialog>
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';

/* Programmatic focus target only; the controls inside carry the visible ring. */
.reset-key-body:focus {
  outline: none;
}

.description {
  margin-bottom: 1.25rem;
  line-height: 1.5;
  color: var(--colour-ti-base);
}

.mt-2 {
  margin-top: 0.5rem;
}

.error-field {
  color: var(--colour-critical-default);
  margin-bottom: 1rem;
}

.checkbox-container {
  display: flex;
  align-items: center;
  /* Room for the checkbox focus ring so the scrollable modal body doesn't clip it. */
  padding: 0.25rem;
  margin-top: 0.75rem;
}

.checkbox {
  width: 1rem;
  height: 1rem;
  color: var(--colour-ti-highlight);
  border-color: var(--colour-surface-border);
  border-radius: 0.25rem;
}

.checkbox-label {
  margin-left: 0.5rem;
  font-size: 0.875rem;
  color: var(--colour-ti-secondary);
}

.actions {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
}

.cancel-button {
  padding: 0.5rem 1rem;
  color: var(--colour-ti-highlight);
  border: 1px solid var(--colour-primary-default);
  border-radius: 0.25rem;
  background-color: transparent;
  transition: background-color 0.2s;
  cursor: pointer;
}

.cancel-button:hover:not(:disabled) {
  background-color: var(--colour-primary-soft);
}

.cancel-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
