<script setup lang="ts">
import Btn from '@send-frontend/apps/send/elements/BtnComponent.vue';
import { useL10n } from '@send-frontend/l10n';
import { useClipboard } from '@vueuse/core';
import { onMounted, ref, watch } from 'vue';

/*
Shows a freshly created share link, once.

The server keeps no copy of a link's secret (for links created without a
password it lives only in the URL fragment), so this is the only place the
full shareable URL is ever displayed. Once the owner navigates away it cannot
be recovered; the links list below only shows metadata.
*/
const { t } = useL10n();
const props = defineProps<{
  url: string;
  hasPassword: boolean;
}>();

const { copy, copied } = useClipboard({ copiedDuring: 3000 });
const urlInput = ref<HTMLInputElement | null>(null);

function focusUrl() {
  urlInput.value?.focus();
  urlInput.value?.select();
}

onMounted(focusUrl);
watch(() => props.url, focusUrl);
</script>

<template>
  <section class="new-link" data-testid="new-access-link">
    <span class="label-text">{{ t('send-share-new-link-label') }}</span>
    <div class="flex gap-2 items-center">
      <input
        ref="urlInput"
        type="text"
        readonly
        :value="url"
        class="flex-1 min-w-0"
        data-testid="new-access-link-url"
        :aria-label="t('send-share-new-link-field')"
        @focus="($event.target as HTMLInputElement).select()"
      />
      <Btn
        secondary
        size="xsmall"
        data-testid="copy-new-access-link"
        @click="copy(url)"
      >
        {{ t('send-share-copy-button', { state: copied ? 'copied' : 'idle' }) }}
      </Btn>
    </div>
    <p v-if="!hasPassword" class="notice" data-testid="new-access-link-notice">
      {{ t('send-share-new-link-notice') }}
    </p>
  </section>
</template>

<style scoped>
.new-link {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 2rem;
}

.label-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--colour-ti-secondary);
}

.notice {
  background-color: var(--colour-warning-soft);
  border: 1px solid var(--colour-warning-default);
  color: var(--colour-ti-warning);
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
}
</style>
