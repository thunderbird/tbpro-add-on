<script lang="ts" setup>
import { SUPPORT_URL } from '@send-frontend/apps/common/constants';
</script>

<template>
  <div class="border-thing">
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
</template>

<style lang="css" scoped>
* {
  color: rgb(217, 217, 222) !important;
}
.border-thing {
  background-image: linear-gradient(45deg, #171b24 47%, #16395f 93%);
  border-radius: 16px;
  padding: 16px;
  height: fit-content;
  width: 100%;
  max-width: 350px;
}
.support-card {
  background: #1e293b;
  padding: 1rem;
  border-radius: 16px;
  border: solid 1px rgba(88, 201, 255, 0.2);
  background-color: rgba(0, 0, 0, 0.4);
}

.support-heading {
  color: white;
  font-size: 1.5rem;
  font-weight: 400;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
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
  font-size: 14px;
  transition: color 0.2s;
  display: block;
  padding: 12px 0;
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
