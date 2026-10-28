<script setup lang="ts">
import CopyIcon from '@send-frontend/apps/common/CopyIcon.vue';
import EyeIcon from '@send-frontend/apps/common/EyeIcon.vue';
import EyeOffIcon from '@send-frontend/apps/common/EyeOffIcon.vue';
import RefreshIcon from '@send-frontend/apps/common/RefreshIcon.vue';
import { computed, ref, useId } from 'vue';

type Props = {
  words?: string[];
  regeneratePassphrase: () => void;
  canRegenerate?: boolean;
  label?: string;
  inputTestId: string;
};

const {
  words = [],
  canRegenerate = true,
  label = 'Encryption Key',
} = defineProps<Props>();

const inputId = useId();

const isVisible = ref(true);

const passphraseDisplay = computed(() => words.join(' - '));

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
</script>

<template>
  <div class="input-group">
    <label class="input-label" :for="inputId">
      {{ label }} <span class="required">*</span>
    </label>
    <div class="input-container">
      <input
        :id="inputId"
        :value="
          isVisible ? passphraseDisplay : '●'.repeat(passphraseDisplay.length)
        "
        type="text"
        class="passphrase-input"
        readonly
        :data-testid="inputTestId"
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
          :disabled="!canRegenerate"
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
</template>

<style scoped>
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
  transition:
    background-color 0.2s,
    color 0.2s,
    transform 0.2s;
}

.icon-button:hover:not(:disabled) {
  background: #f3f4f6;
  color: #1f2937;
}

.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.icon-button:active {
  transform: scale(0.95);
}

@media (prefers-reduced-motion: reduce) {
  .icon-button {
    transition: none;
  }
}
</style>
