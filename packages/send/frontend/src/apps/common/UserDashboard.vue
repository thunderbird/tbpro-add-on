<script setup lang="ts">
import { useAuth } from '@send-frontend/lib/auth';
import { useAuthStore } from '@send-frontend/stores';
import useUserStore from '@send-frontend/stores/user-store';
import { onMounted, ref } from 'vue';
import { useBackupAndRestore } from '../send/composables/useBackupAndRestore';
import AccessLocked from '../send/views/AccessLocked.vue';
import BackupKeys from '../send/views/BackupKeys.vue';
import EncryptedFiles from '../send/views/EncryptedFiles.vue';
import ManageEncryptionKeys from '../send/views/ManageEncryptionKeys.vue';
import SecurityAndPrivacyV2 from '../send/views/SecurityAndPrivacyV2.vue';
import StorageBar from '../send/views/StorageBar.vue';
import SupportBox from '../send/views/SupportBox.vue';

type OIDCUser = typeof getOIDCUser extends () => Promise<infer U> ? U : never;

const { logOutAuth } = useAuth();
const { getOIDCUser } = useAuthStore();
const { user } = useUserStore();
const userfromauth = ref<OIDCUser | null>(null);

onMounted(async () => {
  userfromauth.value = await getOIDCUser();
});

const {
  backupData,
  regeneratePassphrase,
  makeBackup,
  shouldUnlock,
  resetKeys,
  routeToKeyRestore,
  words,
} = useBackupAndRestore();
</script>
<template>
  <section class="content-layout">
    <div class="row">
      <div class="left-column">
        <div class="welcome">Welcome,</div>
        <div class="name">{{ user.name }}</div>
        <h2 class="email">{{ user.thundermailEmail }}</h2>
      </div>

      <div class="right-column">
        <StorageBar />
      </div>
    </div>
    <!-- USERS RESTORING SESSION (renders only when access is locked) -->
    <AccessLocked
      v-if="backupData === 'SHOULD_RESTORE_FROM_BACKUP' && !shouldUnlock"
      :on-recover="routeToKeyRestore"
    />
    <!-- FIRST TIME USERS -->
    <BackupKeys
      v-if="backupData === 'SHOULD_ENCRYPT_AND_BACKUP'"
      :make-backup="makeBackup"
      :words="words"
      :regenerate-passphrase="regeneratePassphrase"
      :log-out-auth="logOutAuth"
    />

    <div class="row">
      <div class="left-column column-gap">
        <EncryptedFiles />
        <!-- GOOD TO GO (user has restored keys from backup) -->
        <SecurityAndPrivacyV2
          v-if="backupData === 'SHOULD_RESTORE_FROM_BACKUP' && !shouldUnlock"
          :on-recover="routeToKeyRestore"
          :on-reset="resetKeys"
        />
        <ManageEncryptionKeys
          v-if="backupData === 'KEYS_IN_LOCAL_STORAGE'"
          :reset-keys="resetKeys"
        />
      </div>
      <div class="right-column">
        <SupportBox />
      </div>
    </div>
  </section>
</template>

<style lang="css" scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';

.column-gap {
  gap: 2rem;
}

.name {
  font-family: Metropolis;
  font-size: 36px;
  font-weight: 300;
  line-height: 1.2;
  letter-spacing: -0.36px;
}

.welcome {
  font-family: Metropolis;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.42px;
  text-transform: uppercase;
}

.email {
  font-family: Inter;
  font-size: 16px;
  line-height: 1.32;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
}

@media (max-width: 1024px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
