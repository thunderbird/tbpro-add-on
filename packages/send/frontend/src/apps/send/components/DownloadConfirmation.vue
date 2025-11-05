<script setup lang="ts">
import ErrorGeneric from '@send-frontend/apps/common/errors/ErrorGeneric.vue';
import { ref } from 'vue';
import ProgressBar from './ProgressBar.vue';

const { closefn, confirm } = defineProps<{
  closefn: () => Promise<string>;
  confirm: () => Promise<boolean | void>;
}>();

const isDownloading = ref(false);
const isError = ref<string>();

const onConfirm = async () => {
  isDownloading.value = true;
  try {
    await confirm();
    closefn();
  } catch (e) {
    console.log(e);
    isError.value = e;
  } finally {
    isDownloading.value = false;
  }
};
</script>

<template>
  <div v-if="isError">
    <ErrorGeneric :error-message="isError" />
  </div>
  <div v-else>
    <div v-if="isDownloading">
      <ProgressBar />
    </div>

    <div v-else class="confirmation-content">
      <h2 class="title">Before you download</h2>

      <div class="disclaimer">
        <p>You're about to download a file through Thunderbird Send.</p>
        <p>
          Files sent with Send are end-to-end encrypted and aren't scanned for
          viruses or malware.
        </p>
        <ul>
          <li>Only download files you trust.</li>
          <li>Use your own security software to protect your device.</li>
        </ul>
        <p>
          MZLA Technologies is not responsible for any issues resulting from
          this download.
        </p>
      </div>

      <button
        class="download-button"
        data-testid="confirm-download"
        @click="onConfirm"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Download
      </button>

      <div class="footer-links">
        <a href="#" class="link">Support</a>
        <span class="separator">•</span>
        <a href="#" class="link">Privacy Policy</a>
      </div>
    </div>
  </div>
</template>

<style lang="css" scoped>
.confirmation-content {
  position: relative;
  padding: 2rem;
  max-width: 600px;
}

.title {
  font-size: 1.5rem;
  font-weight: 500;
  color: #4285f4;
  margin: 0 0 1.5rem 0;
}

.disclaimer {
  color: #333;
  font-size: 0.9375rem;
  line-height: 1.6;
  margin-bottom: 1.5rem;
}

.disclaimer p {
  margin: 0 0 1rem 0;
}

.disclaimer p:last-of-type {
  margin-bottom: 0;
}

.disclaimer ul {
  margin: 1rem 0;
  padding-left: 1.5rem;
  list-style-type: disc;
}

.disclaimer li {
  margin: 0.5rem 0;
}

.download-button {
  width: auto;
  background: #4285f4;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.75rem 1.5rem;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: background 0.2s ease;
}

.download-button:hover {
  background: #3367d6;
}

.footer-links {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e5e5;
  font-size: 0.875rem;
}

.link {
  color: #4285f4;
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.separator {
  color: #999;
}
</style>
