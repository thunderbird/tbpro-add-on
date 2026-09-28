<script setup lang="ts">
import { BaseButton } from '@thunderbirdops/services-ui';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useBackupAndRestore } from '../composables/useBackupAndRestore';
import { useNavigation } from '../composables/useNavigation';
import KeysTemplate from './KeysTemplate.vue';

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
    ><h2 class="title">Manage Files</h2>
    <p class="description">
      Open or manage your encrypted file storage in one secure place.
    </p>
    <BaseButton
      :disabled="!canNavigateToManageFiles"
      class="recover-button"
      @click="handleNavigateToManageFiles"
    >
      Access Your Files
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
  color: var(--text-icon-secondary);
}
</style>
