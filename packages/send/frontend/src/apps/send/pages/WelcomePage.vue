<script lang="ts" setup>
import CheckCircleIcon from '@send-frontend/apps/common/CheckCircleIcon.vue';
import SendIcon from '@send-frontend/apps/common/SendIcon.vue';
import ThundermailIcon from '@send-frontend/apps/common/ThundermailIcon.vue';
import { trpc } from '@send-frontend/lib/trpc';
import { onMounted } from 'vue';

async function setFTUEComplete() {
  await trpc.markFTUEComplete.mutate();
}

onMounted(async () => {
  await setFTUEComplete();
});
</script>

<template>
  <div class="welcome-container">
    <!-- Success Banner -->
    <div class="success-banner">
      <CheckCircleIcon class="check-icon" />
      <span>Authentication and account set up is complete.</span>
    </div>

    <!-- Main Heading -->
    <h1 class="welcome-heading">Welcome to Thunderbird Pro!</h1>

    <!-- Content Layout -->
    <div class="content-layout">
      <!-- Left Column - Main Content Cards -->
      <div class="left-column">
        <!-- Thundermail Card -->
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
            <button class="manage-button">MANAGE THUNDERMAIL ACCOUNTS</button>
          </div>
        </div>

        <!-- Send Card -->
        <div class="content-card">
          <SendIcon class="card-icon" />
          <div class="card-content">
            <div class="card-header">
              <span class="card-label">SEND</span>
              <h2 class="card-title">Finish set up</h2>
            </div>
            <p class="card-text">
              Close this page to set up your encryption password. You can then
              send encrypted files from a compose window or access the file
              manager from your Thunderbird Pro account menu.
            </p>
          </div>
        </div>
      </div>

      <!-- Right Column - Support Card -->
      <div class="right-column">
        <div class="support-card">
          <h3 class="support-heading">Need Support?</h3>
          <nav class="support-links">
            <a href="#" class="support-link">
              Need help with your account? →
            </a>
            <a href="#" class="support-link"> Troubleshooting for desktop → </a>
            <a href="#" class="support-link"> Learn more about encryption → </a>
            <a href="#" class="support-link"> Export your data → </a>
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
  padding: 1rem 1.25rem;
  background: #f0fdf4;
  border: 1px solid #86efac;
  border-radius: 6px;
  margin-bottom: 2rem;
  color: #166534;
  font-size: 14px;
  font-weight: 500;
}

.check-icon {
  flex-shrink: 0;
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
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 2rem;
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

.card-icon {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
}

.card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.card-header {
  margin-bottom: 1rem;
}

.card-label {
  color: #3b82f6;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  display: block;
  margin-bottom: 0.25rem;
}

.card-title {
  font-size: 1.5rem;
  font-weight: 400;
  color: #1f2937;
  margin: 0;
}

.card-text {
  color: #4b5563;
  font-size: 0.9375rem;
  line-height: 1.6;
  margin: 0 0 1.5rem 0;
}

.manage-button {
  background: white;
  border: 1px solid #3b82f6;
  border-radius: 4px;
  color: #3b82f6;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.025em;
  cursor: pointer;
  transition: all 0.2s;
}

.manage-button:hover {
  background: #eff6ff;
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
