<script setup lang="ts">
import { PHRASE_SIZE } from '@send-frontend/apps/common/constants';
import CopyIcon from '@send-frontend/apps/common/CopyIcon.vue';
import DownloadIcon from '@send-frontend/apps/common/DownloadIcon.vue';
import EyeIcon from '@send-frontend/apps/common/EyeIcon.vue';
import EyeOffIcon from '@send-frontend/apps/common/EyeOffIcon.vue';
import RefreshIcon from '@send-frontend/apps/common/RefreshIcon.vue';
import { generatePassphrase } from '@send-frontend/lib/passphrase';
import { computed, ref } from 'vue';

type Props = {
  words?: string[];
  makeBackup?: () => void;
};

const { makeBackup, words } = defineProps<Props>();

const onClose = () => {};
const localWords = ref(words);
const isVisible = ref(true);

const passphraseDisplay = computed(() => {
  return localWords.value.join(' - ');
});

const toggleVisibility = () => {
  isVisible.value = !isVisible.value;
};

const regeneratePassphrase = () => {
  localWords.value = generatePassphrase(PHRASE_SIZE);
};

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(passphraseDisplay.value);
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
  }
};

const handleDownloadAndContinue = async () => {
  makeBackup();
  onClose();
};
</script>

<template>
  <div class="modal-overlay">
    <div class="modal-container">
      <div class="modal-header">
        <!-- Send Logo -->
      </div>

      <div class="modal-body">
        <h1 class="title">Complete your encryption setup</h1>

        <div class="description">
          <p class="font-semibold">
            Thunderbird Send uses end-to-end encryption.
          </p>

          <p class="mt-2">
            To finish setting up, you'll need to create a recovery key. This key
            lets you access your encrypted files if you sign in on a new device,
            reinstall Thunderbird, or get logged out.
          </p>

          <p class="mt-2">
            Your key is finalized when you click
            <strong>Download and Continue</strong>.
          </p>

          <p class="mt-2">
            Save a copy in a safe place. It's
            <strong
              >never stored on our servers and cannot be recovered if
              lost.</strong
            >
          </p>
        </div>

        <div class="input-group">
          <label class="input-label">
            Encryption Key <span class="required">*</span>
          </label>
          <div class="input-container">
            <input
              :value="
                isVisible
                  ? passphraseDisplay
                  : '●'.repeat(passphraseDisplay.length)
              "
              type="text"
              class="passphrase-input"
              readonly
              data-testid="backup-keys-passphrase-input-overlay"
            />
            <div class="input-actions">
              <button
                type="button"
                class="icon-button"
                :title="isVisible ? 'Hide' : 'Show'"
                @click="toggleVisibility"
              >
                <EyeIcon v-if="isVisible" />
                <EyeOffIcon v-else />
              </button>
              <button
                type="button"
                class="icon-button"
                title="Regenerate"
                @click="regeneratePassphrase"
              >
                <RefreshIcon />
              </button>
              <button
                type="button"
                class="icon-button"
                title="Copy"
                @click="copyToClipboard"
              >
                <CopyIcon />
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="download-button"
          data-testid="encrypt-keys-button-overlay"
          @click="handleDownloadAndContinue"
        >
          <DownloadIcon class="button-icon" />
          Download and Continue
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.893);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-container {
  background: white;
  border-radius: 24px;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.modal-header {
  padding: 3rem 3rem 1rem;
}

.icon-container {
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon {
  width: 40px;
  height: 40px;
  color: #3b82f6;
}

.modal-body {
  padding: 0 3rem 3rem;
}

.title {
  font-size: 2rem;
  font-weight: 400;
  color: #3b82f6;
  margin: 1.5rem 0 1rem;
  line-height: 1.2;
}

.description {
  margin-bottom: 2rem;
  line-height: 1.6;
  color: #1f2937;
}

.font-semibold {
  font-weight: 600;
}

.mt-2 {
  margin-top: 0.5rem;
}

.input-group {
  margin-bottom: 2rem;
}

.input-label {
  display: block;
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: #1f2937;
}

.required {
  color: #ef4444;
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
  font-family: 'Courier New', Courier, monospace;
  letter-spacing: 0.5px;
}

.input-actions {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  border-left: 1px solid #e5e7eb;
}

.icon-button {
  padding: 0.5rem;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  transition: all 0.2s;
}

.icon-button:hover {
  background: #f3f4f6;
  color: #1f2937;
}

.icon-button:active {
  transform: scale(0.95);
}

.download-button {
  width: 100%;
  padding: 0.875rem 1.5rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.2s;
}

.download-button:hover {
  background: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
}

.download-button:active {
  transform: translateY(0);
}

.button-icon {
  width: 20px;
  height: 20px;
}

@media (max-width: 768px) {
  .modal-container {
    border-radius: 16px;
    max-height: 95vh;
  }

  .modal-header {
    padding: 2rem 1.5rem 1rem;
  }

  .modal-body {
    padding: 0 1.5rem 2rem;
  }

  .title {
    font-size: 1.5rem;
  }

  .icon-container {
    width: 64px;
    height: 64px;
  }

  .icon {
    width: 32px;
    height: 32px;
  }
}
</style>
