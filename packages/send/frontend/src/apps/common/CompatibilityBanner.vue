<script lang="ts" setup>
import { useClientGate } from '@send-frontend/composables/useClientGate';
import { usePreferredDark } from '@vueuse/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useConfigStore } from '../send/stores/config-store';
import CloseButton from './CloseButton.vue';

const { isProd, isThunderbirdHost } = useConfigStore();
const prefersDark = usePreferredDark();
const { gate } = useClientGate();
const isTestingDismissed = ref(false);
const isUpdateDismissed = ref(false);

const showTesting = computed(() => !isProd && !isTestingDismissed.value);
const showUpdate = computed(
  () => gate.value.action === 'banner' && !isUpdateDismissed.value
);

const defaultMessage = isThunderbirdHost
  ? 'A new version of Send is available. Update Thunderbird and its add-ons to get it.'
  : 'A new version of Send is available. Reload the page to get it.';

// Announced by screen readers: a live region only fires for changes inside an
// element that already exists, so this stays mounted and only its text changes.
// The banner can mount with the notice already known (after the boundary's
// loader), so the text is filled only after the empty region is in the DOM.
const ANNOUNCE_DELAY_MS = 100;
const canAnnounce = ref(false);
let announceTimer: ReturnType<typeof setTimeout> | undefined;
onMounted(() => {
  announceTimer = setTimeout(() => {
    canAnnounce.value = true;
  }, ANNOUNCE_DELAY_MS);
});
onBeforeUnmount(() => clearTimeout(announceTimer));
const announcement = computed(() =>
  canAnnounce.value && showUpdate.value
    ? `Update available. ${gate.value.message ?? defaultMessage}`
    : ''
);

function dismissTesting() {
  isTestingDismissed.value = true;
}
function dismissUpdate() {
  isUpdateDismissed.value = true;
}
</script>

<template>
  <p
    class="sr-only"
    aria-live="polite"
    data-testid="prompt-update-announcement"
  >
    {{ announcement }}
  </p>
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
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
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
  background: var(--colour-primary-default);
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
