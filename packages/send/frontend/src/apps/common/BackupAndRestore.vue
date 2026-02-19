<script setup lang="ts">
// move the following imports elsewhere
import { useAuth } from '@send-frontend/lib/auth';
import { LoadingSkeleton } from '@thunderbirdops/services-ui';
import { useBackupAndRestore } from '../send/composables/useBackupAndRestore';
import AccessLocked from '../send/views/AccessLocked.vue';
import BackupKeys from '../send/views/BackupKeys.vue';
import ResetEncryptionKey from '../send/views/ResetEncryptionKey.vue';
import RestoreKeys from '../send/views/RestoreKeys.vue';
import SecurityAndPrivacy from '../send/views/SecurityAndPrivacy.vue';
import { watchEffect } from 'vue';

const { logOutAuth } = useAuth();

const emit = defineEmits<{
  (e: 'backup-completed'): void;
}>();

const {
  isLoadingBackup,
  backupData,
  errorMessage,
  regeneratePassphrase,
  setPassphrase,
  makeBackup,
  restoreFromBackup,
  shouldUnlock,
  shouldReset,
  resetKeys,
  words,
  allGood,
} = useBackupAndRestore();

watchEffect(() => {
  if (allGood.value) {
    console.log('Backup and restore completed');
    emit('backup-completed');
  }
});
</script>

<template>
  <section class="container">
    <div class="max-w-xl">
      <!-- Loading state -->
      <LoadingSkeleton
        v-if="isLoadingBackup"
        width="576px"
        height="86px"
        border-radius="9px"
        :is-loading="isLoadingBackup"
      />
      <div v-else>
        <section class="recovery-main" data-testid="key-recovery">
          <!-- FIRST TIME USERS -->
          <BackupKeys
            v-if="backupData === 'SHOULD_ENCRYPT_AND_BACKUP'"
            :make-backup="makeBackup"
            :words="words"
            :regenerate-passphrase="regeneratePassphrase"
            :log-out-auth="logOutAuth"
          />
          <!-- USERS RESTORING SESSION -->
          <AccessLocked
            v-if="backupData === 'SHOULD_RESTORE_FROM_BACKUP' && !shouldUnlock"
            :on-recover="
              () => {
                shouldUnlock = true;
              }
            "
          />
          <RestoreKeys
            v-if="backupData === 'SHOULD_RESTORE_FROM_BACKUP' && shouldUnlock"
            :restore-from-backup="restoreFromBackup"
            :set-passphrase="setPassphrase"
            :message="errorMessage"
            :on-reset="
              () => {
                shouldReset = true;
              }
            "
            @cancel="() => (shouldUnlock = false)"
          />
          <!-- RESET -->
          <ResetEncryptionKey
            v-if="shouldReset"
            @confirm="resetKeys"
            @cancel="() => (shouldReset = false)"
          />

          <!-- GOOD TO GO -->
          <SecurityAndPrivacy
            v-if="backupData === 'KEYS_IN_LOCAL_STORAGE'"
            :reset-keys="resetKeys"
          />
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
</style>
