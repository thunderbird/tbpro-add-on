<script setup lang="ts">
import FeedbackBox from '@send-frontend/apps/common/FeedbackBox.vue';
import RightArrowIcon from '@send-frontend/apps/common/RightArrowIcon.vue';
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

<template>
  <div class="auth-buttons">
    <PrimaryButton
      v-if="!isExtension"
      data-testid="login-button-tbpro"
      @click.capture="loginToOidc"
    >
      <div class="buttons-container">
        <span class="button-text">
          {{ loginText }}
        </span>
        <RightArrowIcon />
      </div>
    </PrimaryButton>

    <PrimaryButton
      v-if="isExtension"
      data-testid="extension-management-button"
      @click.capture="loginToOidcForExtension"
    >
      <div class="buttons-container">
        <span class="button-text">
          {{ loginText }}
        </span>
        <RightArrowIcon />
      </div>
    </PrimaryButton>
  </div>
  <FeedbackBox />
</template>

<style scoped>
.buttons-container {
  display: flex;
  flex-direction: row;
  gap: 12px;
  justify-content: center;
  align-items: center;
  max-width: 300px;
  padding: 0 1rem;
}
.button-text {
  font-size: 13px;
  font-weight: 600;
}
</style>
