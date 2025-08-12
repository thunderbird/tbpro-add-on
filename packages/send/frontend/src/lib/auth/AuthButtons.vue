<script setup lang="ts">
import Btn from '@send-frontend/apps/send/elements/BtnComponent.vue';
type ReturnType = Promise<void> | void;
defineProps<{
  isExtension: boolean;
  loginToMozAccount: () => ReturnType;
  loginToOidc: () => ReturnType;
  loginToOidcForExtension: () => ReturnType;
}>();
</script>

<template>
  <Btn primary data-testid="login-button" @click.prevent="loginToMozAccount"
    >Log into Mozilla Account</Btn
  >
  <Btn
    v-if="!isExtension"
    primary
    data-testid="login-button-tbpro"
    @click.prevent="loginToOidc"
    >Log in using your TB Pro Account</Btn
  >
  <Btn
    v-if="isExtension"
    secondary
    data-testid="extension-management-button"
    @click.prevent="loginToOidcForExtension"
    >Log in using your TB Pro Account</Btn
  >
</template>
