<script setup lang="ts">
import { Storage } from '@send-frontend/lib/storage';
import { PrimaryButton } from '@thunderbirdops/services-ui';
import { useRouter } from 'vue-router';
import KeysTemplate from '../views/KeysTemplate.vue';
import SupportBox from '../views/SupportBox.vue';

const router = useRouter();

// Clear the stale local key material (wrapped keys + cached passphrase), then
// send the user to Security & Privacy. We intentionally do NOT ask for or store
// a new passphrase here: with the keys gone, that page resolves to
// SHOULD_RESTORE_FROM_BACKUP and renders RestoreKeys, which is the normal flow
// for collecting the new passphrase and re-fetching the keys from the server
// backup. Keeping this page dumb avoids duplicating that logic and avoids
// writing the passphrase from here.
//
// We route instead of reloading so the recovery form is one click away: a
// reload would land back on whatever guarded route sent the user here, and a
// locked keychain would just bounce them to this page again.
const clearKeysAndRestore = async () => {
  const storage = new Storage();
  await storage.clearKeys();
  router.push('/send/security-and-privacy');
};
</script>

<template>
  <section class="content-layout">
    <div class="row">
      <div>
        <KeysTemplate>
          <h2 class="section-title text-red-700">Warning</h2>
          <p class="description">
            Your keys are incorrect. This may happen if you reset your
            passphrase on a different device. Click below to clear the outdated
            keys on this device; you'll then be asked for your new passphrase to
            restore access.
          </p>
          <PrimaryButton
            data-testid="passphrase-changed-submit"
            @click.prevent="clearKeysAndRestore"
          >
            Enter new passphrase
          </PrimaryButton>
        </KeysTemplate>
      </div>

      <div>
        <SupportBox />
      </div>
    </div>
  </section>
</template>

<style lang="css" scoped>
* {
  padding-left: 1rem;
  padding-right: 1rem;
  margin-top: 1rem;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
}
</style>
