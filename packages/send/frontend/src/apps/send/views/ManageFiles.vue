<script setup lang="ts">
import { useL10n } from '@send-frontend/l10n';
import { BaseButton } from '@thunderbirdops/services-ui';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useBackupAndRestore } from '../composables/useBackupAndRestore';
import { useNavigation } from '../composables/useNavigation';
import KeysTemplate from './KeysTemplate.vue';

const { t } = useL10n();
const router = useRouter();
const { backupData } = useBackupAndRestore();
const { filesLink } = useNavigation();
const manageFilesPath = computed(() => filesLink.path);

const canNavigateToManageFiles = computed(
  () => backupData.value !== 'SHOULD_RESTORE_FROM_BACKUP'
);

function handleNavigateToManageFiles() {
  // Navigate to the Manage Files page
  router.push(manageFilesPath.value);
}
</script>

<template>
  <KeysTemplate
    ><h2 class="title">{{ t('send-dashboard-manage-files-title') }}</h2>
    <p class="description">
      {{ t('send-dashboard-manage-files-description') }}
    </p>
    <BaseButton
      :disabled="!canNavigateToManageFiles"
      class="recover-button"
      @click="handleNavigateToManageFiles"
    >
      {{ t('send-dashboard-manage-files-button') }}
    </BaseButton>
  </KeysTemplate>
</template>

<style lang="css" scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
.recover-button {
  margin-top: 1rem;
}
.title {
  font-family: Metropolis;
}
.description {
  font-family: Inter;
  font-size: 16px;
  font-stretch: normal;
  line-height: 1.32;
  color: var(--colour-ti-secondary);
}
</style>
