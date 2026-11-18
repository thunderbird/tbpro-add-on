<script setup lang="ts">
import ProButton from '@send-frontend/apps/common/ProButton.vue';
import { useL10n } from '@send-frontend/l10n';
import { useRouter } from 'vue-router';
import KeysTemplate from './KeysTemplate.vue';

const { t } = useL10n();
const router = useRouter();
</script>

<template>
  <KeysTemplate>
    <div>
      <div class="" style="margin-bottom: 32px">
        <h1 class="title">{{ t('send-security-title') }}</h1>

        <div class="description">
          <h3 class="title-secondary">{{ t('send-keys-manage-title') }}</h3>
          <p>{{ t('send-security-description') }}</p>
        </div>

        <ProButton
          data-testid="recover-access-button"
          type="secondary"
          @click="() => router.push('/send/security-and-privacy')"
        >
          {{ t('send-security-key-button') }}
        </ProButton>
      </div>
      <span class="divider"></span>
      <div class="spacing">
        <div class="title-secondary">{{ t('send-delete-data-title') }}</div>
        <p>{{ t('send-delete-data-summary') }}</p>
        <div class="delete-link light">
          <router-link to="/send/security-and-privacy?delete=true">{{
            t('send-delete-data-link')
          }}</router-link>
        </div>
      </div>
    </div>
  </KeysTemplate>
</template>

<style scoped>
@import '@send-frontend/apps/common/tbpro-styles.css';

.spacing {
  gap: 18px;
  display: flex;
  flex-direction: column;
}
.delete-link * {
  width: 98px;
  height: 15px;
  flex-grow: 0;
  font-family: Inter;
  font-size: 12px;
  font-weight: normal;
  font-stretch: normal;
  text-decoration: underline;
  line-height: normal;
  letter-spacing: normal;
  text-align: left;
  color: var(--colour-ti-critical);
}
.divider {
  display: block;
  width: 100%;
  height: 1px;
  margin: 32px 0;
  background-color: var(--colour-surface-border);
  color: var(--colour-surface-border);
}

.title-secondary {
  font-family: Inter;
  font-size: 16px;
  font-weight: 600;
  color: var(--colour-ti-secondary);
}

.description {
  margin-bottom: 2rem;
  line-height: 1.6;
  color: var(--colour-ti-base);
  gap: 16px;
  display: flex;
  flex-direction: column;
}

.input-group {
  margin-bottom: 2rem;
}

.input-label {
  display: block;
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: var(--colour-ti-base);
  font-size: 0.875rem;
}

.required {
  color: var(--colour-ti-critical);
}

.error-field {
  color: var(--colour-critical-default);
  margin-bottom: 1rem;
}

.input-container {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid var(--colour-surface-border);
  border-radius: 8px;
  background: var(--colour-surface-raised);
  overflow: hidden;
}

.input-container:focus-within {
  border-color: var(--colour-primary-default);
  outline: 2px solid
    color-mix(in srgb, var(--colour-primary-default) 8%, transparent);
}

.passphrase-input {
  flex: 1;
  padding: 0.75rem 1rem;
  border: none;
  background: transparent;
  font-size: 1rem;
  color: var(--colour-ti-base);
  outline: none;
}

.passphrase-input::placeholder {
  color: var(--colour-ti-muted);
}

.button-group {
  display: flex;
  gap: 1rem;
  justify-content: space-between;
}

.continue-button {
  padding: 0.75rem 2rem;
  background: var(--colour-primary-default);
  color: var(--colour-ti-base-inverted);
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.continue-button:hover:not(:disabled) {
  background: var(--colour-primary-default);
  transform: translateY(-1px);
  box-shadow: 0 4px 6px -1px
    color-mix(in srgb, var(--colour-primary-default) 30%, transparent);
}

.continue-button:active:not(:disabled) {
  transform: translateY(0);
}

.continue-button:disabled {
  background: var(--colour-surface-border-intense);
  cursor: not-allowed;
  opacity: 0.5;
}

.cancel-button {
  padding: 0.75rem 2rem;
  background: var(--colour-surface-raised);
  color: var(--colour-ti-highlight);
  border: 1px solid var(--colour-primary-default);
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-button:hover {
  background: var(--colour-primary-soft);
}

.cancel-button:active {
  transform: translateY(0);
}

.reset-access {
  bottom: 0.75rem;
  right: 0.75rem;
  display: flex;
  align-items: end;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  color: var(--colour-ti-warning);
  background-color: transparent;
  border: 1px solid var(--colour-warning-default);
  border-radius: 0.25rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.reset-access:hover {
  background-color: var(--colour-warning-soft);
}

.reset-access svg {
  width: 16px;
  height: 16px;
}

.recover-access {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--colour-ti-base-inverted);
  background-color: var(--colour-primary-default);
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

@media (max-width: 768px) {
  .button-group {
    flex-direction: column-reverse;
  }

  .continue-button,
  .cancel-button {
    width: 100%;
  }
}
</style>
