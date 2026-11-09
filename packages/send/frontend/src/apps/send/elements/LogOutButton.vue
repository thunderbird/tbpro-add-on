<script setup lang="ts">
import OpenerIcon from '@send-frontend/apps/common/OpenerIcon.vue';
import { useL10n } from '@send-frontend/l10n';

type LogOutProps = {
  logOut: () => Promise<void>;
};

defineProps<LogOutProps>();
const { t } = useL10n();
</script>

<template>
  <div class="container">
    <button size="small" data-testid="log-out-button" @click.prevent="logOut">
      <span>{{ t('send-log-out') }}</span>
      <OpenerIcon />
    </button>
  </div>
</template>

<style scoped>
button {
  color: var(--colour-primary-default);
  padding: 10px 0px;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
}
</style>
