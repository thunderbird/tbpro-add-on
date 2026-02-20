<script setup lang="ts">
import ProButton from '@send-frontend/apps/common/ProButton.vue';
import KeysTemplate from './KeysTemplate.vue';

type Props = {
  onRecover: () => void;
};

const { onRecover } = defineProps<Props>();
</script>

<template>
  <KeysTemplate>
    <div class="">
      <div class="" style="margin-bottom: 32px">
        <h1 class="title">Security & Privacy</h1>

        <div class="description">
          <h3>Manage Encryption Key</h3>
          <p>
            Download a backup of your active encryption key, or reset your
            account if your key becomes locked or inaccessible.
          </p>
        </div>

        <ProButton
          class="recover-access"
          data-testid="recover-access-button-security-privacy"
          @click="onRecover"
        >
          Recover Access
        </ProButton>
      </div>
    </div>
  </KeysTemplate>
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';

h3 {
  font-weight: 700;
}

.title {
  font-size: 24px;
  font-weight: 500;
  color: #3b82f6;
}

.description {
  margin-bottom: 2rem;
  line-height: 1.6;
  color: #1f2937;
}

.recover-access {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: white;
  background-color: #0a84ff;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: background-color 0.2s;
}
</style>
