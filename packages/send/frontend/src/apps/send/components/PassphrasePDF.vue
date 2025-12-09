<script setup lang="ts">
import SendIconBlack from '@send-frontend/apps/common/SendIconBlack.vue';
import ShieldIconBlack from '@send-frontend/apps/common/ShieldIconBlack.vue';
import { useAsciiPDF } from '@send-frontend/composables/useAsciiPDF';
import { downloadTxt } from '@send-frontend/lib/filesync';
import { useKeychainStore, useUserStore } from '@send-frontend/stores';
import { computed, onMounted, ref } from 'vue';

const { user } = useUserStore();
const { keychain } = useKeychainStore();

const formattedDate = computed(() => {
  const date = new Date();
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
});

const passphraseFromLocalStorage = keychain.getPassphraseValue();

// Text content refs
const logoText = ref('Thunderbird');
const logoBadge = ref('PRO');
const title = ref('Send Secure Key Backup');
const warningText = ref(
  'Your encryption key gives you access to your encrypted files.'
);
const bullet1 = ref(
  'If you lose your key, you will no longer be able to view or upload files in Thunderbird Send.'
);
const bullet2 = ref(
  'Your key is never stored on our servers and cannot be recovered.'
);
const bullet3 = ref(
  "When you sign in on a new device or your session ends, you'll need your key to restore access."
);
const instruction = ref(
  "Fill out and save this form, then store it in a safe place you'll remember."
);
const formTitle = ref('Send Encryption Key');
const accountLabel = ref('THUNDERBIRD PRO ACCOUNT');
const keyLabel = ref('SEND ENCRYPTION KEY');
const generatedLabel = ref('Generated');
const learnMoreText = ref('Learn more about encryption keys');
const learnMoreUrl = ref('https://support.tb.pro');

// Generate ASCII version with all text content
const { asciiContent } = useAsciiPDF({
  logoText,
  logoBadge,
  title,
  warningText: computed(() => '⚠ IMPORTANT: ' + warningText.value),
  bullet1,
  bullet2,
  bullet3,
  instruction,
  formTitle,
  accountLabel,
  keyLabel,
  generatedLabel,
  learnMore: computed(() => `Learn more: ${learnMoreUrl.value}`),
  email: computed(() => user.thundermailEmail || user.email),
  passphrase: ref(passphraseFromLocalStorage),
  date: formattedDate,
});

onMounted(async () => {
  await downloadTxt(
    asciiContent.value,
    `tb-send-${user.thundermailEmail || user.email}passphrase-ascii.txt`
  );
});
</script>

<template>
  <div class="passphrase-pdf">
    <header class="header">
      <div class="logo">
        <span class="logo-text">{{ logoText }}</span>
        <span class="logo-badge">{{ logoBadge }}</span>
      </div>
      <h1 class="title">{{ title }}</h1>
    </header>

    <div class="notice">
      <div class="notice-header">
        <ShieldIconBlack />
        <span class="notice-text">{{ warningText }}</span>
      </div>
    </div>

    <ul class="info-list">
      <li>{{ bullet1 }}</li>
      <li>{{ bullet2 }}</li>
      <li>{{ bullet3 }}</li>
    </ul>

    <p class="instruction">{{ instruction }}</p>

    <div class="form-card">
      <div class="form-header">
        <div class="parallel">
          <h2 class="form-title">{{ formTitle }}</h2>
          <div class="icon-wrap">
            <SendIconBlack />
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">{{ accountLabel }}</label>
        <div class="input-wrapper">
          <div class="input-icon">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path
                d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"
              />
              <path
                d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"
              />
            </svg>
          </div>
          <input
            type="text"
            :value="user.thundermailEmail || user.email"
            readonly
            class="form-input"
          />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">{{ keyLabel }}</label>
        <div class="input-wrapper">
          <div class="input-icon">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <input
            type="text"
            :value="passphraseFromLocalStorage"
            readonly
            class="form-input"
          />
        </div>
      </div>

      <div class="form-footer">
        <span class="generated-label">{{ generatedLabel }}:</span>
        <span class="generated-date">{{ formattedDate }}</span>
      </div>
    </div>

    <a
      :href="learnMoreUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="learn-more"
    >
      {{ learnMoreText }}
    </a>
  </div>
</template>

<style scoped>
.passphrase-pdf {
  max-width: 680px;
  margin: 0 auto;
  padding: 2rem;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
    Arial, sans-serif;
  color: #1f2937;
}

.header {
  margin-bottom: 2rem;
}

.parallel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.logo-text {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2937;
}

.logo-badge {
  background: #1f2937;
  color: white;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.title {
  font-size: 1.875rem;
  font-weight: 600;
  color: #3b82f6;
  margin: 0;
}

.notice {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.notice-icon {
  flex-shrink: 0;
}

.notice-text {
  font-size: 0.875rem;
  font-weight: 500;
}

.notice-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.notice-header svg {
  max-height: 24px;
}

.info-list {
  margin: 0 0 1.5rem 1.25rem;
  padding: 0;
  list-style: disc;
}

.info-list li {
  font-size: 0.875rem;
  line-height: 1.5;
  margin-bottom: 0.5rem;
  color: #4b5563;
}

.instruction {
  font-size: 0.875rem;
  line-height: 1.5;
  color: #4b5563;
  margin-bottom: 1.5rem;
}

.form-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0 1.5rem 1.5rem;
  margin-bottom: 1.5rem;
}

.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #3b82f6;
  margin: 0;
}

.icon-wrap svg {
  max-width: 30px;
}

.copy-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
  border-radius: 0.375rem;
  transition: all 0.15s;
}

.copy-button:hover {
  background: #e5e7eb;
  color: #1f2937;
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group:last-of-type {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 0.75rem;
  display: flex;
  align-items: center;
  color: #9ca3af;
  pointer-events: none;
}

.form-input {
  width: 100%;
  padding: 0.75rem 0.75rem 0.75rem 2.5rem;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  color: #1f2937;
  outline: none;
  transition: border-color 0.15s;
}

.form-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
}

.generated-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
}

.generated-date {
  font-size: 0.875rem;
  color: #4b5563;
}

.learn-more {
  display: inline-block;
  font-size: 0.875rem;
  color: #3b82f6;
  text-decoration: none;
  transition: color 0.15s;
}

.learn-more:hover {
  color: #2563eb;
  text-decoration: underline;
}

.ascii-version {
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 2px solid #e5e7eb;
}

.ascii-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 1rem;
}

.ascii-content {
  background: #1f2937;
  color: #10b981;
  padding: 1.5rem;
  border-radius: 0.5rem;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.75rem;
  line-height: 1.2;
  overflow-x: auto;
  white-space: pre;
}
</style>
