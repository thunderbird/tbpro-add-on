<script setup lang="ts">
import { BaseButton } from '@thunderbirdops/services-ui';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useBackupAndRestore } from '../composables/useBackupAndRestore';
import { useNavigation } from '../composables/useNavigation';
import KeysTemplate from './KeysTemplate.vue';

const router = useRouter();
const { backupData } = useBackupAndRestore();
const { navLinkPaths } = useNavigation();
const encryptedFilesPath = computed(() => {
  const encryptedFilesLink = navLinkPaths.find(
    (link) => link.label === 'Encrypted Files'
  );
  return encryptedFilesLink ? encryptedFilesLink.path : '/send/encrypted-files';
});

const canNavigateToEncryptedFiles = computed(
  () => backupData.value !== 'SHOULD_RESTORE_FROM_BACKUP'
);

function handleNavigateToEncryptedFiles() {
  // Navigate to the Encrypted Files page
  router.push(encryptedFilesPath.value);
}
</script>

<template>
  <KeysTemplate
    ><h2>Encrypted Files</h2>
    <p>Open or manage your encrypted file storage in one secure place.</p>
    <BaseButton
      :disabled="!canNavigateToEncryptedFiles"
      class="recover-button"
      @click="handleNavigateToEncryptedFiles"
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
</style>
