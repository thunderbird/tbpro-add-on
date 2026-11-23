<script setup lang="ts">
import CopyIcon from '@send-frontend/apps/common/CopyIcon.vue';
import DownloadIcon from '@send-frontend/apps/common/DownloadIcon.vue';
import EyeIcon from '@send-frontend/apps/common/EyeIcon.vue';
import EyeOffIcon from '@send-frontend/apps/common/EyeOffIcon.vue';
import { downloadPassPhrase } from '@send-frontend/lib/passphraseUtils';
import { useL10n } from '@send-frontend/l10n';
import { useKeychainStore, useUserStore } from '@send-frontend/stores';
import { DangerButton } from '@thunderbirdops/services-ui';
import { useClipboard } from '@vueuse/core';
import { computed, ref } from 'vue';
import KeysTemplate from './KeysTemplate.vue';

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const { t } = useL10n();
const { keychain } = useKeychainStore();
const {
  user: { email },
} = useUserStore();
const { copy } = useClipboard();

const passphraseFromLocalStorage = keychain.getPassphraseValue();
const isPassphraseVisible = ref(false);

const formattedPassphrase = computed(() => {
  return passphraseFromLocalStorage.split(' ').join(' - ');
});

const copyToClipboard = () => {
  if (passphraseFromLocalStorage) {
    copy(formattedPassphrase.value);
  }
};

const keyVisibilityLabel = computed(() =>
  t('send-keys-manage-visibility', {
    state: isPassphraseVisible.value ? 'shown' : 'hidden',
  })
);

const togglePassphraseVisibility = () => {
  isPassphraseVisible.value = !isPassphraseVisible.value;
};
</script>

<template>
  <div class="keys-container">
    <KeysTemplate>
      <div class="key-section">
        <h2 class="title">{{ t('send-keys-manage-title') }}</h2>

        <p class="section-description">
          {{ t('send-keys-manage-description') }}
        </p>

        <div class="key-field">
          <label class="key-label">
            {{ t('send-keys-field-label') }} <span class="required">*</span>
          </label>
          <div class="key-input-container">
            <input
              :type="isPassphraseVisible ? 'text' : 'password'"
              :value="formattedPassphrase"
              readonly
              class="key-input"
            />
            <button
              class="icon-button"
              :title="keyVisibilityLabel"
              :aria-label="keyVisibilityLabel"
              @click="togglePassphraseVisibility"
            >
              <EyeIcon v-if="isPassphraseVisible" />
              <EyeOffIcon v-else />
            </button>
            <button
              class="icon-button"
              :title="t('send-keys-manage-copy')"
              @click="copyToClipboard"
            >
              <CopyIcon />
            </button>
            <button
              class="icon-button"
              :title="t('send-keys-manage-download')"
              @click="
                () => downloadPassPhrase(passphraseFromLocalStorage, email)
              "
            >
              <DownloadIcon />
            </button>
          </div>
        </div>
      </div>
    </KeysTemplate>

    <KeysTemplate>
      <div class="key-section reset-section">
        <h2 class="title">{{ t('send-keys-reset-title') }}</h2>

        <p class="section-description">
          {{ t('send-keys-reset-description') }}
        </p>

        <DangerButton
          data-testid="show-reset"
          class="reset-button"
          @click="emit('confirm')"
        >
          {{ t('send-keys-reset-button') }}
        </DangerButton>
      </div>
    </KeysTemplate>
  </div>
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
.title {
  font-family: Metropolis;
}
.keys-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.reset-section {
  background-color: var(--colour-surface-raised);
}

.section-description {
  color: var(--colour-ti-muted);
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
  color: var(--colour-ti-secondary);
  margin-bottom: 0.5rem;
}

.required {
  color: var(--colour-ti-critical);
}

.key-input-container {
  display: flex;
  align-items: center;
  border: 1px solid var(--colour-surface-border);
  border-radius: 0.375rem;
  background-color: var(--colour-surface-lower);
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
  color: var(--colour-ti-secondary);
}

.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border: none;
  background: transparent;
  color: var(--colour-ti-muted);
  cursor: pointer;
  border-radius: 0.25rem;
  transition: all 0.2s;
}

.icon-button:hover {
  color: var(--colour-ti-secondary);
  background-color: var(--colour-surface-subtle);
}

.reset-button {
  padding: 18px 16px;
}

.reset-button:hover {
  background-color: var(--colour-critical-default);
}

.reset-button:active {
  background-color: var(--colour-critical-default);
}
</style>
