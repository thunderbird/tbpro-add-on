<script lang="ts" setup>
import CheckCircleIcon from '@send-frontend/apps/common/CheckCircleIcon.vue';
import {
  SUPPORT_URL,
  THUNDERMAIL_URL,
} from '@send-frontend/apps/common/constants';
import SendIconTBPro from '@send-frontend/apps/common/SendIconTBPro.vue';
import ThundermailIcon from '@send-frontend/apps/common/ThundermailIcon.vue';
import { OPEN_MANAGEMENT_PAGE } from '@send-frontend/lib/const';
import { trpc } from '@send-frontend/lib/trpc';
import { onMounted } from 'vue';

async function setFTUEComplete() {
  await trpc.markFTUEComplete.mutate();
}

onMounted(async () => {
  await setFTUEComplete();
});

async function handleOpenThundermail() {
  window.open(THUNDERMAIL_URL, '_blank');
}

async function handleSetEncryptionPassword() {
  window.postMessage(
    {
      type: OPEN_MANAGEMENT_PAGE,
    },
    window.location.origin
  );
}
</script>

<template>
  <div class="welcome-container">
    <!-- Success Banner -->
    <div class="success-banner">
      <CheckCircleIcon class="check-icon" />
      <span>Sign-in complete.</span>
    </div>

    <!-- Main Heading -->
    <h1 class="welcome-heading">Welcome to Thunderbird Pro!</h1>

    <!-- Content Layout -->
    <div class="content-layout">
      <!-- Left Column - Main Content Cards -->
      <div class="left-column">
        <!-- Thundermail Card -->

        <!-- Send Card -->
        <div class="content-card">
          <SendIconTBPro class="card-icon" />
          <div class="card-content">
            <div class="card-header">
              <span class="card-label">SEND</span>
              <h2 class="card-title">Finish setup</h2>
            </div>
            <p class="card-text">
              Next, set your encryption password. Then you’re ready to send
              encrypted files or manage them from your Thunderbird Pro account
              menu.
            </p>

            <button
              class="primary-button"
              @click.prevent="handleSetEncryptionPassword"
            >
              Set encryption password
            </button>
          </div>
        </div>

        <div class="content-card">
          <ThundermailIcon class="card-icon" />
          <div class="card-content">
            <div class="card-header">
              <span class="card-label">THUNDERMAIL</span>
              <h2 class="card-title">Account added</h2>
            </div>
            <p class="card-text">
              Your Thundermail account has been added. Find the new inbox at the
              bottom of the folder pane, or open the dashboard to manage your
              accounts.
            </p>

            <button
              class="secondary-button"
              @click.prevent="handleOpenThundermail"
            >
              Manage Thundermail
            </button>
          </div>
        </div>
      </div>

      <!-- Right Column - Support Card -->
      <div class="right-column">
        <div class="support-card">
          <h3 class="support-heading">Need Support?</h3>
          <nav class="support-links">
            <a
              :href="SUPPORT_URL"
              class="support-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Need help with your account? →
            </a>
            <a
              :href="SUPPORT_URL"
              class="support-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Troubleshooting for desktop →
            </a>
            <a
              :href="SUPPORT_URL"
              class="support-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more about encryption →
            </a>
            <a
              :href="SUPPORT_URL"
              class="support-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Export your data →
            </a>
          </nav>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.welcome-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.success-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: var(--colour-success-soft);
  border: 1px solid var(--colour-success-default);
  border-radius: 8px;
  margin-bottom: 2rem;
  color: var(--colour-success-default);
  font-size: 0.9375rem;
  font-weight: 500;
}

.check-icon {
  flex-shrink: 0;
  color: var(--colour-success-default);
}

.welcome-heading {
  font-size: 2rem;
  font-weight: 400;
  color: #3b82f6;
  margin: 0 0 2rem 0;
  line-height: 1.2;
}

.content-layout {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 2rem;
}

.left-column {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.content-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 2rem;
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.card-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.card-header {
  margin-bottom: 0.75rem;
}

.card-label {
  color: #3b82f6;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  display: block;
  margin-bottom: 0.5rem;
}

.card-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
  line-height: 1.3;
}

.card-text {
  color: #6b7280;
  font-size: 0.9375rem;
  line-height: 1.6;
  margin: 0 0 1.5rem 0;
}

.primary-button {
  background: #2563eb;
  border: none;
  border-radius: 6px;
  color: white;
  padding: 0.625rem 1.25rem;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  align-self: flex-start;
}

.primary-button:hover {
  background: #1d4ed8;
}

.secondary-button {
  background: transparent;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  color: #374151;
  padding: 0.625rem 1.25rem;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  align-self: flex-start;
}

.secondary-button:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.right-column {
  display: flex;
}

.support-card {
  background: #1e293b;
  border-radius: 8px;
  padding: 2rem;
  height: fit-content;
  width: 100%;
}

.support-heading {
  color: white;
  font-size: 1.5rem;
  font-weight: 400;
  margin: 0 0 1.5rem 0;
}

.support-links {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.support-link {
  color: #e2e8f0;
  font-size: 0.9375rem;
  text-decoration: none;
  transition: color 0.2s;
  display: block;
}

.support-link:hover {
  color: white;
}

@media (max-width: 1024px) {
  .content-layout {
    grid-template-columns: 1fr;
  }

  .right-column {
    order: -1;
  }
}
</style>
