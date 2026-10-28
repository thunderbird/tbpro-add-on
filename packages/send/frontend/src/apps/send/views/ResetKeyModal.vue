<script setup lang="ts">
import { DangerButton, ModalDialog } from '@thunderbirdops/services-ui';
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
      <!-- ModalDialog labels itself with aria-labelledby="title" -->
      <h1 id="title" class="title">Reset Encryption Key</h1>
    </template>

    <div ref="body" class="reset-key-body" tabindex="-1" @keydown.esc="cancel">
      <div class="description">
        <p>
          This is your new encryption key. Save a copy in a safe place: it's
          never stored on our servers and cannot be recovered if lost.
        </p>
        <p class="mt-2">
          Your current key stays active until you click
          <strong>Download key and reset</strong>. After that, files encrypted
          with your previous key will no longer be accessible.
        </p>
      </div>

      <PassphraseField
        :words="words"
        :regenerate-passphrase="regeneratePassphrase"
        :can-regenerate="canRegenerate"
        label="New Encryption Key"
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
          I understand I'll lose access to my old files.
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
          Cancel
        </button>
        <DangerButton
          :disabled="!understood || saving"
          data-testid="danger-button"
          @click="confirm"
        >
          Download key and reset
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

.title {
  margin: 0;
}

.description {
  margin-bottom: 2rem;
  line-height: 1.6;
  color: #1f2937;
}

.mt-2 {
  margin-top: 0.5rem;
}

.error-field {
  color: var(--colour-danger-default);
  margin-bottom: 1rem;
}

.checkbox-container {
  display: flex;
  align-items: center;
}

.checkbox {
  width: 1rem;
  height: 1rem;
  color: #2563eb;
  border-color: #d1d5db;
  border-radius: 0.25rem;
}

.checkbox-label {
  margin-left: 0.5rem;
  font-size: 0.875rem;
  color: #374151;
}

.actions {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
}

.cancel-button {
  padding: 0.5rem 1rem;
  color: #2563eb;
  border: 1px solid #2563eb;
  border-radius: 0.25rem;
  background-color: transparent;
  transition: background-color 0.2s;
  cursor: pointer;
}

.cancel-button:hover:not(:disabled) {
  background-color: #eff6ff;
}

.cancel-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
