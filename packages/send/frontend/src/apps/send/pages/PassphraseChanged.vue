<script setup lang="ts">
import { Storage } from '@send-frontend/lib/storage';
import { PrimaryButton } from '@thunderbirdops/services-ui';
import KeysTemplate from '../views/KeysTemplate.vue';
import SupportBox from '../views/SupportBox.vue';

// Clear the stale local key material (wrapped keys + cached passphrase) and
// reload. We intentionally do NOT ask for or store a new passphrase here: the
// normal validation/restore flow that runs on the next page load handles the
// rest (prompting for the new passphrase and re-fetching keys from the server
// backup). Keeping this page dumb avoids duplicating that logic and avoids
// writing the passphrase from here.
const clearKeysAndReload = async () => {
  const storage = new Storage();
  await storage.clearKeys();
  location.reload();
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
            @click.prevent="clearKeysAndReload"
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
