<script setup lang="ts">
import { useClientGate } from '@send-frontend/composables/useClientGate';
import { PrimaryButton } from '@thunderbirdops/services-ui';
import { usePreferredDark } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { useConfigStore } from '../send/stores/config-store';
import FeedbackBox from './FeedbackBox.vue';

const emit = defineEmits<{ blocked: [] }>();

// Inside Thunderbird (popup, management page or a tab) the fix is updating
// Thunderbird and its add-ons; in a browser it is reloading the page.
const { isThunderbirdHost, isDev } = useConfigStore();
const prefersDark = usePreferredDark();
const { gate, clientVersion, error } = useClientGate();
const showInstructions = ref(false);

// Only a resolved `block` replaces the app; loading and errors never hide it.
const isBlocked = computed(() => gate.value.action === 'block');
watch(
  isBlocked,
  (blocked) => {
    if (blocked) emit('blocked');
  },
  { immediate: true }
);
const isLocalCertError = computed(
  () => isDev && Boolean(error.value?.message?.includes('Failed to fetch'))
);

const defaultTitle = isThunderbirdHost
  ? 'Update Thunderbird to continue using Send'
  : 'Reload to continue using Send';
const defaultMessage = isThunderbirdHost
  ? 'This version of the Send add-on is no longer supported.'
  : 'This version of Send is out of date. Reload the page to get the latest version; if that does not help, clear your browser cache.';

const reload = () => {
  window.location.reload();
};
const toggleInstructions = () => {
  showInstructions.value = !showInstructions.value;
};
</script>

<template>
  <section
    v-if="isBlocked"
    class="client-gate-block"
    :class="{ dark: prefersDark }"
    role="alert"
    data-testid="force-update-banner"
  >
    <h2 class="title" data-testid="client-gate-title">
      {{ gate.title ?? defaultTitle }}
    </h2>
    <p class="description emphasis" data-testid="client-gate-message">
      {{ gate.message ?? defaultMessage }}
    </p>

    <template v-if="isThunderbirdHost">
      <PrimaryButton
        data-testid="client-gate-how-to-update"
        :aria-expanded="showInstructions"
        @click="toggleInstructions"
      >
        How to update
      </PrimaryButton>
      <ol
        v-if="showInstructions"
        class="instructions"
        data-testid="client-gate-instructions"
      >
        <li>
          Open Help &gt; About Thunderbird and install any available update.
        </li>
        <li>
          Open Add-ons and Themes, click the gear icon and choose Check for
          Updates.
        </li>
        <li>Restart Thunderbird.</li>
      </ol>
    </template>
    <template v-else>
      <p class="versions" data-testid="client-gate-versions">
        You are using version {{ clientVersion
        }}<template v-if="gate.minVersion"
          >; version {{ gate.minVersion }} or newer is required</template
        >.
      </p>
      <PrimaryButton data-testid="refresh-button" @click="reload">
        Reload
      </PrimaryButton>
    </template>

    <FeedbackBox />
  </section>

  <template v-else>
    <p v-if="isLocalCertError" class="dev-hint" data-testid="error">
      Make sure you accept the self signed cert to use this app locally. You can
      <a href="https://localhost:8088/">do it here</a>.
    </p>
    <slot></slot>
  </template>
</template>

<style scoped>
.client-gate-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1rem;
  box-sizing: border-box;
  width: 100%;
  max-width: 40rem;
  margin: 1rem auto;
  padding: 1.5rem;
  border: 1px solid var(--colour-danger-default);
  border-left-width: 4px;
  border-radius: 8px;
  background: var(--colour-danger-soft);
  color: var(--colour-neutral-900);
  font-family: Inter, sans-serif;
}

/* Same approach as NavBar: services-ui dark tokens only apply under html.dark. */
.client-gate-block.dark {
  --colour-danger-soft: #7f1d1d;
  --colour-danger-default: #fee2e2;
  --colour-neutral-900: #eeeef0;
}

.title {
  margin: 0;
  font-family: Metropolis, sans-serif;
  font-size: 20px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--colour-danger-default);
}

.description,
.versions,
.instructions {
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
}

.emphasis,
.versions {
  font-weight: 600;
}

.instructions {
  padding-left: 1.25rem;
  list-style: decimal;
}

.dev-hint {
  padding: 1rem;
  background: var(--colour-warning-soft);
  color: var(--colour-neutral-900);
}
</style>
