<script setup lang="ts">
import ProButton from '@send-frontend/apps/common/ProButton.vue';
import { useKeychainStore } from '@send-frontend/stores';
import { computed, onMounted, ref } from 'vue';
import KeysTemplate from './KeysTemplate.vue';
import ManageKeys from './ManageKeys.vue';
import ResetEncryptionKey from './ResetEncryptionKey.vue';

const { resetKeys, showKeysByDefault } = defineProps<{
  resetKeys: () => void;
  showKeysByDefault?: boolean;
}>();

const showKeys = ref(!!showKeysByDefault);
const willReset = ref(false);
const { keychain } = useKeychainStore();
const isKeychainLocked = computed(() => keychain.locked);

onMounted(() => {
  if (isKeychainLocked.value) {
    window.alert(
      'Your keys are incorrect. This may happen if you reset your passphrase on a different device. Please log out and log back in to restore access to your keys.'
    );
    showKeys.value = true;
  }
});
</script>

<template>
  <!-- Key Management Error -->
  <KeysTemplate v-if="isKeychainLocked">
    <h2 class="section-title text-red-700">Warning</h2>
    <p class="description">
      Your keys are incorrect. This may happen if you reset your passphrase on a
      different device. Please log out and log back in to restore access to your
      keys.
    </p>
  </KeysTemplate>

  <!-- Key Management Happy Path ✅ -->
  <KeysTemplate v-if="!showKeys">
    <h2 class="section-title">Security and Privacy</h2>
    <p class="description">
      Download a backup of your active encryption key, or reset your account if
      your key becomes locked or inaccessible.
    </p>
    <ProButton
      data-testid="security-and-privacy"
      @click="() => (showKeys = true)"
    >
      Encryption Key
    </ProButton>
  </KeysTemplate>

  <ManageKeys
    v-if="showKeys && !isKeychainLocked"
    @confirm="() => (willReset = true)"
  />

  <ResetEncryptionKey
    v-if="willReset"
    @confirm="resetKeys"
    @cancel="() => (willReset = false)"
  />
</template>

<style scoped>
h2 {
  font-size: 22px;
}
.description {
  margin-bottom: 2rem;
  line-height: 1.6;
  color: #1f2937;
}
.reset-button {
  padding: 0.625rem 1.25rem;
  background-color: #dc2626;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}
</style>
