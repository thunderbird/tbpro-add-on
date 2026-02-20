<script lang="ts" setup>
import { SUPPORT_URL } from '@send-frontend/apps/common/constants';
</script>

<template>
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
</template>

<style lang="css" scoped>
.support-card {
  background: #1e293b;
  border-radius: 16px;
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
  gap: 0;
}

.support-link {
  color: #e2e8f0;
  font-size: 0.9375rem;
  text-decoration: none;
  transition: color 0.2s;
  display: block;
  padding: 1rem 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.support-link:first-child {
  border-top: none;
  padding-top: 0;
}

.support-link:hover {
  color: white;
}
</style>
