<script setup lang="ts">
import { useL10n } from '@send-frontend/l10n';

const { t } = useL10n();
</script>

<template>
  <h1>{{ t('send-locked-title') }}</h1>
</template>
