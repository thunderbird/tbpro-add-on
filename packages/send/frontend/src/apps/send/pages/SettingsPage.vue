<script setup lang="ts">
import { forceCloseWindow } from '@send-frontend/lib/login';
import { computed, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useBackupAndRestore } from '../composables/useBackupAndRestore';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import DeleteSendDataCard from '../views/DeleteSendDataCard.vue';
import DeleteSendDataSuccessCard from '../views/DeleteSendDataSuccessCard.vue';
import ResetKeyModal from '../views/ResetKeyModal.vue';
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
  beginReset,
  confirmReset,
  cancelReset,
  words,
  regeneratePassphrase,
  canRegenerate,
  savingBackup,
  deleteFiles,
  filesDeleted,
  deleteFailed,
  resetDeleteFiles,
  keysInLocalStorage,
} = useBackupAndRestore();

// Leaving the page before "Download key and reset" keeps the old key (#1355).
onUnmounted(cancelReset);

const showDeleteCard = computed(() => route.query.delete === 'true');
const storedPassphrase = computed(() => keychain.getPassphraseValue() ?? '');

// When this page is opened from the add-on upload popup (`closeOnComplete`),
// close it as soon as the passphrase has been accepted and the keys are in
// local storage — the bridge has the passphrase at that point. Closing this
// window lets the upload popup re-check configuration and continue the upload.
const closeOnComplete = computed(() => route.query.closeOnComplete === 'true');

// The `keybackup` query is async, so on a fresh window load `keysInLocalStorage`
// starts false and flips to true once the passphrase is accepted (or the page
// resolves as already set up) — a transition this watcher catches. We
// deliberately don't use `immediate`: closing on the very first tick would race
// the bridge relay and could tear the page down before the passphrase reaches
// the add-on.
watch(keysInLocalStorage, (ready) => {
  if (!ready || !closeOnComplete.value) {
    return;
  }
  forceCloseWindow();
});

const closeDeleteCard = () => {
  // Clear a failed-delete state so reopening the form doesn't show a stale error.
  resetDeleteFiles();
  router.push('/send/security-and-privacy');
};
</script>
<template>
  <div class="container">
    <h1 class="title top">Settings</h1>
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
          v-else-if="backupData === 'SHOULD_RESTORE_FROM_BACKUP'"
          :restore-from-backup="restoreFromBackup"
          :set-passphrase="setPassphrase"
          :message="errorMessage"
          :on-reset="beginReset"
          @cancel="() => router.push('/send/profile?showDashboard=true')"
        />
        <SecurityAndPrivacy
          v-else-if="backupData === 'KEYS_IN_LOCAL_STORAGE'"
          :show-keys-by-default="true"
          :begin-reset="beginReset"
        />
      </section>
      <SupportBox />
    </div>
    <!-- RESET -->
    <ResetKeyModal
      v-if="shouldReset"
      :words="words"
      :regenerate-passphrase="regeneratePassphrase"
      :can-regenerate="canRegenerate"
      :error-message="errorMessage"
      :saving="savingBackup"
      @confirm="confirmReset"
      @cancel="cancelReset"
    />
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
