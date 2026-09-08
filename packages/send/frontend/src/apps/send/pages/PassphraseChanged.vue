<script setup lang="ts">
import { parsePassphrase } from '@send-frontend/lib/passphraseUtils';
import { Storage } from '@send-frontend/lib/storage';
import { PrimaryButton } from '@thunderbirdops/services-ui';
import { ref } from 'vue';
import KeysTemplate from '../views/KeysTemplate.vue';
import SupportBox from '../views/SupportBox.vue';

const newPassphrase = ref('');
const errorMessage = ref('');

const submit = async () => {
  const input = newPassphrase.value.trim();
  if (!input) {
    return;
  }

  let canonicalPassphrase: string;
  try {
    // Accept space- or dash-separated words; normalize the same way
    // useBackupAndRestore does: parsePassphrase -> words joined by spaces
    // (the stored passphrase is later split by ' ' during restore).
    canonicalPassphrase = parsePassphrase(input).split('-').join(' ');
  } catch (e) {
    errorMessage.value = String((e as Error)?.message ?? e);
    return;
  }

  const storage = new Storage();
  // Order matters: write the NEW passphrase first so the app can restore
  // with it after reload, then drop the stale wrapped keys so they get
  // re-fetched from the server backup under the new passphrase.
  await storage.storePassPhrase(canonicalPassphrase);
  await storage.clearWrappedKeys();
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
            passphrase on a different device. Enter your new passphrase below to
            restore access to your keys on this device.
          </p>
          <div class="restore-container">
            <input
              v-model="newPassphrase"
              class="restore-input"
              type="text"
              placeholder="Enter your new passphrase"
              data-testid="passphrase-changed-input"
              @keydown.enter.prevent="submit"
            />
          </div>
          <p
            v-if="errorMessage"
            class="error-message"
            data-testid="passphrase-changed-error"
          >
            {{ errorMessage }}
          </p>
          <PrimaryButton
            data-testid="passphrase-changed-submit"
            @click.prevent="submit"
          >
            Use new passphrase
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
.restore-container {
  display: flex;
}
.restore-input {
  width: 100%;
}
.error-message {
  color: #b91c1c;
}
</style>
