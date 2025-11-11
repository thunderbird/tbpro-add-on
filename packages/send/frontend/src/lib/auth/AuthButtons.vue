<script setup lang="ts">
import FeedbackBox from '@send-frontend/apps/common/FeedbackBox.vue';
import { PrimaryButton } from '@thunderbirdops/services-ui';
import { ref } from 'vue';

type ReturnType = Promise<void> | void;
defineProps<{
  isExtension: boolean;
  loginToOidc: () => ReturnType;
  loginToOidcForExtension: () => ReturnType;
}>();

const loginText = ref('Sign In');
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
  <FeedbackBox />
</template>

<style scoped>
.auth-buttons {
  margin: 1rem;
}
.auth-buttons button {
  font-size: 13px;
  font-weight: 600;
  max-width: 300px;
}
</style>
