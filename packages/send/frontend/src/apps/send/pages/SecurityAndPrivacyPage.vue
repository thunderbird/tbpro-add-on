<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useBackupAndRestore } from '../composables/useBackupAndRestore';
import ResetEncryptionKeyV2 from '../views/ResetEncryptionKeyV2.vue';
import RestoreKeys from '../views/RestoreKeys.vue';
import SecurityAndPrivacy from '../views/SecurityAndPrivacy.vue';
import SupportBox from '../views/SupportBox.vue';
const router = useRouter();

const {
  backupData,
  errorMessage,
  setPassphrase,
  restoreFromBackup,
  shouldReset,
  resetKeys,
} = useBackupAndRestore();
</script>
<template>
  <h1 class="title">Security & Privacy</h1>
  <div class="row">
    <!-- Backup and Restore Section -->
    <section>
      <RestoreKeys
        v-if="backupData === 'SHOULD_RESTORE_FROM_BACKUP' && !shouldReset"
        :restore-from-backup="restoreFromBackup"
        :set-passphrase="setPassphrase"
        :message="errorMessage"
        :on-reset="() => (shouldReset = true)"
        @cancel="() => router.push('/send/profile?showDashboard=true')"
      />
      <!-- RESET -->
      <ResetEncryptionKeyV2
        v-if="shouldReset"
        @confirm="resetKeys"
        @cancel="() => (shouldReset = false)"
      />
      <SecurityAndPrivacy
        v-if="backupData === 'KEYS_IN_LOCAL_STORAGE'"
        :show-keys-by-default="true"
        :reset-keys="resetKeys"
      />
    </section>
    <SupportBox />
  </div>
</template>

<style lang="css" scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
}

@media (max-width: 1024px) {
  .content-layout {
    display: grid;
    grid-template-columns: 1fr;
  }

  .right-column {
    order: -1;
  }
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
