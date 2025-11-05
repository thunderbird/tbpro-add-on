<script setup lang="ts">
import { PrimaryButton } from '@thunderbirdops/services-ui';
import { ref } from 'vue';

type ReturnType = Promise<void> | void;
defineProps<{
  isExtension: boolean;
  loginToOidc: () => ReturnType;
  loginToOidcForExtension: () => ReturnType;
}>();

const loginText = ref('Log in using your TB Pro Account');
</script>

<template class="auth-buttons">
  <PrimaryButton
    v-if="!isExtension"
    data-testid="login-button-tbpro"
    @click.capture="loginToOidc"
    >{{ loginText }}</PrimaryButton
  >
  <PrimaryButton
    v-if="isExtension"
    data-testid="extension-management-button"
    @click.capture="loginToOidcForExtension"
    >{{ loginText }}</PrimaryButton
  >
</template>

<style scoped>
.auth-buttons {
  margin: 1rem;
}
</style>
