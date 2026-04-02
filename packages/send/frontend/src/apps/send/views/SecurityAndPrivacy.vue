<script setup lang="ts">
import ProButton from '@send-frontend/apps/common/ProButton.vue';
import { ref } from 'vue';
import KeysTemplate from './KeysTemplate.vue';
import ManageKeys from './ManageKeys.vue';
import ResetEncryptionKey from './ResetEncryptionKey.vue';

const { resetKeys, showKeysByDefault } = defineProps<{
  resetKeys: () => void;
  showKeysByDefault?: boolean;
}>();

const showKeys = ref(!!showKeysByDefault);
const willReset = ref(false);
</script>

<template>
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

  <ManageKeys v-if="showKeys" @confirm="() => (willReset = true)" />

  <ResetEncryptionKey
    v-if="willReset"
    @confirm="resetKeys"
    @cancel="() => (willReset = false)"
  />
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';
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
