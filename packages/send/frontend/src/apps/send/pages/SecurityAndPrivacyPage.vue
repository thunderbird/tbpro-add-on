<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useBackupAndRestore } from '../composables/useBackupAndRestore';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import DeleteSendDataCard from '../views/DeleteSendDataCard.vue';
import DeleteSendDataSuccessCard from '../views/DeleteSendDataSuccessCard.vue';
import ResetEncryptionKeyV2 from '../views/ResetEncryptionKeyV2.vue';
import RestoreKeys from '../views/RestoreKeys.vue';
import SecurityAndPrivacy from '../views/SecurityAndPrivacy.vue';
import SupportBox from '../views/SupportBox.vue';
const route = useRoute();
const router = useRouter();

const { keychain } = useKeychainStore();

const {
  backupData,
  errorMessage,
  setPassphrase,
  restoreFromBackup,
  shouldReset,
  resetKeys,
  deleteFiles,
  filesDeleted,
  deleteFailed,
  resetDeleteFiles,
} = useBackupAndRestore();

const showDeleteCard = computed(() => route.query.delete === 'true');
const storedPassphrase = computed(() => keychain.getPassphraseValue() ?? '');

const closeDeleteCard = () => {
  // Clear a failed-delete state so reopening the form doesn't show a stale error.
  resetDeleteFiles();
  router.push('/send/security-and-privacy');
};
</script>
<template>
  <div class="container">
    <h1 class="title top">Security & Privacy</h1>
    <div class="row" :class="{ single: showDeleteCard }">
      <!-- Backup and Restore Section -->
      <section>
        <!--
          `filesDeleted` is the delete mutation's success flag; it only flips
          back on a fresh page load, which is exactly what the success card's
          "Return to dashboard" does, so it can't get stuck showing a stale
          confirmation.
        -->
        <DeleteSendDataSuccessCard v-if="showDeleteCard && filesDeleted" />
        <DeleteSendDataCard
          v-else-if="showDeleteCard"
          :stored-passphrase="storedPassphrase"
          :server-error="
            deleteFailed
              ? 'Something went wrong deleting your data. Please try again.'
              : ''
          "
          @confirm="deleteFiles"
          @cancel="closeDeleteCard"
        />
        <RestoreKeys
          v-else-if="
            backupData === 'SHOULD_RESTORE_FROM_BACKUP' && !shouldReset
          "
          :restore-from-backup="restoreFromBackup"
          :set-passphrase="setPassphrase"
          :message="errorMessage"
          :on-reset="() => (shouldReset = true)"
          @cancel="() => router.push('/send/profile?showDashboard=true')"
        />
        <!-- RESET -->
        <ResetEncryptionKeyV2
          v-else-if="shouldReset"
          @confirm="resetKeys"
          @cancel="() => (shouldReset = false)"
        />
        <SecurityAndPrivacy
          v-else-if="backupData === 'KEYS_IN_LOCAL_STORAGE'"
          :show-keys-by-default="true"
          :reset-keys="resetKeys"
        />
      </section>
      <SupportBox />
    </div>
  </div>
</template>

<style lang="css" scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
.container {
  max-width: 1200px;
  margin: auto;
  padding: 2rem;
}

.row {
  display: grid;
  grid-template-columns: 3fr 2fr;
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
