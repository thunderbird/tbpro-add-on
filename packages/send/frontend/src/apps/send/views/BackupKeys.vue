<script setup lang="ts">
import CopyIcon from '@send-frontend/apps/common/CopyIcon.vue';
import DownloadIcon from '@send-frontend/apps/common/DownloadIcon.vue';
import EyeIcon from '@send-frontend/apps/common/EyeIcon.vue';
import EyeOffIcon from '@send-frontend/apps/common/EyeOffIcon.vue';
import RefreshIcon from '@send-frontend/apps/common/RefreshIcon.vue';
import {
  useConfigStore,
  useStatusStore,
  useUserStore,
} from '@send-frontend/stores';
import { computed, onMounted, ref } from 'vue';
import KeysTemplate from './KeysTemplate.vue';
import { useSendConfig } from '@send-frontend/composables/useSendConfig';
import { useRouter } from 'vue-router';

type Props = {
  words?: string[];
  makeBackup?: () => void;
  regeneratePassphrase: () => void;
  logOutAuth: () => Promise<void>;
};

const { makeBackup, words, logOutAuth } = defineProps<Props>();

const { isExtension } = useConfigStore();
const { validators } = useStatusStore();
const { clearUserFromStorage } = useUserStore();
const { queryAddonLoginState } = useSendConfig();
const router = useRouter();

const onClose = () => {};

const isVisible = ref(true);

const passphraseDisplay = computed(() => {
  return words.join(' - ');
});

const toggleVisibility = () => {
  isVisible.value = !isVisible.value;
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

const handleLogout = async () => {
  await clearUserFromStorage();
  await logOutAuth();
  await validators();
  if (!isExtension) {
    location.reload();
  }
};

// We want to avoid this page showing up on orphan windows if the user is not logged in
onMounted(async () => {
  const addonLoginState = await queryAddonLoginState();
  if (!addonLoginState.isLoggedIn) {
    console.log('[router] User not logged in to addon, closing window');
    window.close();
    router.push('/force-close');
    return;
  }
});
</script>

<template>
  <KeysTemplate class="modal-overlay" :is-overlay="true">
    <div class="">
      <div class="">
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
        <div class="log-out-button-container">
          <button
            size="small"
            data-testid="log-out-button-overlay"
            @click.prevent="handleLogout"
          >
            <span>Log out</span>
          </button>
        </div>
      </div>
    </div>
  </KeysTemplate>
</template>

<style scoped>
.log-out-button-container {
  margin-top: 1rem;
  color: var(--primary-default);
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
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
  .modal-header {
    padding: 2rem 1.5rem 1rem;
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
