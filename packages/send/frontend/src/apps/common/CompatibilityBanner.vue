<script lang="ts" setup>
import { useClientGate } from '@send-frontend/composables/useClientGate';
import { usePreferredDark } from '@vueuse/core';
import { computed, ref } from 'vue';
import { useConfigStore } from '../send/stores/config-store';
import CloseButton from './CloseButton.vue';

const { isProd, isTbproExtension } = useConfigStore();
const prefersDark = usePreferredDark();
const { gate } = useClientGate();
const isTestingDismissed = ref(false);
const isUpdateDismissed = ref(false);

const showTesting = computed(() => !isProd && !isTestingDismissed.value);
const showUpdate = computed(
  () => gate.value.action === 'banner' && !isUpdateDismissed.value
);

const defaultMessage = isTbproExtension
  ? 'A new version of Send is available. Update Thunderbird and its add-ons to get it.'
  : 'A new version of Send is available. Reload the page to get it.';

function dismissTesting() {
  isTestingDismissed.value = true;
}
function dismissUpdate() {
  isUpdateDismissed.value = true;
}
</script>

<template>
  <header v-if="showTesting || showUpdate" data-testid="compatibility-banner">
    <div v-if="showTesting" class="notice" data-testid="testing-banner">
      <p class="testing text-center">
        You are using a testing version of Thunderbird Send. It may be unstable.
      </p>
      <CloseButton :close="dismissTesting" aria-label="Dismiss" />
    </div>

    <div
      v-if="showUpdate"
      class="notice client-gate-banner"
      :class="{ dark: prefersDark }"
      aria-live="polite"
      data-testid="prompt-update-banner"
    >
      <p class="title">Update available</p>
      <p data-testid="prompt-update-message">
        {{ gate.message ?? defaultMessage }}
      </p>
      <CloseButton
        :close="dismissUpdate"
        aria-label="Dismiss"
        data-testid="prompt-update-close"
      />
    </div>
  </header>
</template>

<style scoped>
header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}
.notice {
  position: relative;
}
.testing {
  background: var(--colour-send-primary-accent-1);
  padding: 1rem;
  font-weight: bold;
}
.client-gate-banner {
  padding: 1rem 3rem 1rem 1rem;
  border-left: 4px solid var(--colour-warning-default);
  border-radius: 8px;
  background: var(--colour-warning-soft);
  color: var(--colour-neutral-900);
  font-size: 14px;
  line-height: 1.4;
}
.client-gate-banner.dark {
  --colour-warning-soft: #423606;
  --colour-warning-default: #fef2c3;
  --colour-neutral-900: #eeeef0;
}
.title {
  font-weight: bold;
}
.closebutton {
  position: absolute;
  right: 0;
  top: 0;
  padding: 0.5rem;
}
</style>
