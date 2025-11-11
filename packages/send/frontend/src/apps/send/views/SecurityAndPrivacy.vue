<script setup lang="ts">
import { PrimaryButton } from '@thunderbirdops/services-ui';
import { ref } from 'vue';
import KeysTemplate from './KeysTemplate.vue';
import ManageKeys from './ManageKeys.vue';
import ResetEncryptionKey from './ResetEncryptionKey.vue';

const { resetKeys } = defineProps<{
  resetKeys: () => void;
}>();

const showKeys = ref(false);
const willReset = ref(false);
</script>

<template>
  <KeysTemplate v-if="!showKeys">
    <h2 class="section-title">Security and Privacy</h2>
    <p class="description">
      Download a backup of your active encryption key, or reset your account if
      your key becomes locked or inaccessible.
    </p>
    <PrimaryButton @click.prevent="() => (showKeys = true)">
      Encryption Key
    </PrimaryButton>
  </KeysTemplate>

  <ManageKeys v-if="showKeys" @confirm="() => (willReset = true)" />

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
</style>
