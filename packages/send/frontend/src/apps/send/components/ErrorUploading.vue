<script setup lang="ts">
import { useL10n } from '@send-frontend/l10n';
import { useStatusStore } from '../stores/status-store';

const { progress } = useStatusStore();
const { t } = useL10n();
</script>

<template>
  <div
    class="flex flex-col gap-2 items-center justify-center p-4 rounded-lg transition duration-500 ease-in-out text-white bg-red-400 hover:bg-red-300"
    role="status"
  >
    <p>
      {{ progress.error || t('send-upload-error-generic') }}
    </p>
  </div>
</template>
