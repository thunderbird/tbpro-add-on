<script setup>
import prettyBytes from 'pretty-bytes';
import { computed, ref } from 'vue';
import ReportContent from '../components/ReportContent.vue';

const props = defineProps({
  sender: {
    type: String,
    default: 'Unknown sender',
  },
  filename: {
    type: String,
    default: 'Unknown file',
  },
  filesize: {
    type: Number, // size in bytes
    default: 0,
  },
  daysToExpiry: {
    type: Number,
    default: null,
  },
  createdAt: {
    type: [Date, String],
    default: null,
  },
  id: {
    type: String,
    default: null,
  },
  index: {
    type: Number,
    default: 0,
  },
  containerId: {
    type: String,
    default: null,
  },
  // NOTE: Hash (SHA256) is not available in the current Upload/Item data structure
  // and would need to be added to the backend response if checksum verification is required
  hash: {
    type: String,
    default: null,
  },
  handleDownload: { type: Function, required: true },
});

const fileData = computed(() => ({
  sender: props.sender,
  filename: props.filename,
  filesize: prettyBytes(props.filesize),
  linkExpiration: formatExpiration(props.daysToExpiry, props.createdAt),
  hash: props.hash || 'Not available',
}));

function formatExpiration(daysToExpiry, createdAt) {
  if (daysToExpiry !== null && daysToExpiry !== undefined) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + daysToExpiry);
    return expiryDate.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
  }

  if (createdAt) {
    const date = new Date(createdAt);
    // Assuming a default expiration period (e.g., 7 days) if daysToExpiry is not provided
    date.setDate(date.getDate() + 7);
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
  }

  return 'Not available';
}

const showChecksum = ref(false);
const copied = ref(false);

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(props.fileData.hash);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};
</script>

<template>
  <div class="file-info-container">
    <div class="file-info-card">
      <h2 class="section-title">FILE INFORMATION</h2>

      <div class="info-row">
        <span class="info-label">Sender</span>
        <a :href="`mailto:${fileData.sender}`" class="info-value link">
          {{ fileData.sender }}
        </a>
      </div>

      <div class="info-row">
        <span class="info-label">Filename</span>
        <span class="info-value">{{ fileData.filename }}</span>
      </div>

      <div class="info-row">
        <span class="info-label">Filesize</span>
        <span class="info-value">{{ fileData.filesize }}</span>
      </div>
      <!-- 
      <div class="info-row">
        <span class="info-label">Link expiration</span>
        <span class="info-value">{{ fileData.linkExpiration }}</span>
      </div> -->

      <div class="checksum-section">
        <button
          class="checksum-toggle"
          :aria-expanded="showChecksum"
          @click="showChecksum = !showChecksum"
        >
          View checksum
          <svg
            class="chevron"
            :class="{ rotated: showChecksum }"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <transition name="slide">
          <div v-if="showChecksum" class="checksum-content">
            <div class="checksum-row">
              <span class="checksum-label">Hash (SHA256)</span>
              <div class="checksum-value-container">
                <code class="checksum-value">{{ fileData.hash }}</code>
                <button
                  class="copy-button"
                  :title="copied ? 'Copied!' : 'Copy to clipboard'"
                  @click="copyToClipboard"
                >
                  <svg
                    v-if="!copied"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect
                      x="9"
                      y="9"
                      width="13"
                      height="13"
                      rx="2"
                      ry="2"
                    ></rect>
                    <path
                      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                    ></path>
                  </svg>
                  <svg
                    v-else
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </transition>
      </div>

      <button
        class="download-button"
        :data-testid="`download-button-${index}`"
        @click.prevent="handleDownload"
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
      <ReportContent :upload-id="id" :container-id="containerId" />
    </div>
  </div>
</template>

<style scoped>
.file-info-card {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  max-width: 700px;
  width: 100%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #666;
  letter-spacing: 0.05em;
  margin: 0 0 1.5rem 0;
}

.info-row {
  display: flex;
  padding: 1rem 0;
  border-bottom: 1px solid #e5e5e5;
}

.info-label {
  flex: 0 0 140px;
  color: #666;
  font-size: 0.9375rem;
}

.info-value {
  color: #333;
  font-size: 0.9375rem;
}

.link {
  color: #0066cc;
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.checksum-section {
  border-bottom: 1px solid #e5e5e5;
}

.checksum-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 0;
  background: none;
  border: none;
  color: #666;
  font-size: 0.9375rem;
  cursor: pointer;
  text-align: left;
}

.checksum-toggle:hover {
  color: #333;
}

.chevron {
  transition: transform 0.2s ease;
  color: #999;
}

.chevron.rotated {
  transform: rotate(180deg);
}

.checksum-content {
  padding-bottom: 1rem;
}

.checksum-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.checksum-label {
  color: #666;
  font-size: 0.875rem;
}

.checksum-value-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.checksum-value {
  flex: 1;
  font-family: monospace;
  font-size: 0.8125rem;
  color: #333;
  background: #f8f8f8;
  padding: 0.5rem;
  border-radius: 4px;
  overflow-wrap: break-word;
  word-break: break-all;
}

.copy-button {
  flex-shrink: 0;
  background: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.375rem;
  cursor: pointer;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.copy-button:hover {
  background: #f8f8f8;
  border-color: #ccc;
}

.download-button {
  margin-top: 1.5rem;
  background: #0066cc;
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
  background: #0052a3;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
}

.slide-enter-to,
.slide-leave-from {
  max-height: 200px;
  opacity: 1;
}

@media (max-width: 640px) {
  .file-info-container {
    padding: 1rem;
  }

  .file-info-card {
    padding: 1.5rem;
  }

  .info-row {
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-label {
    flex: none;
  }
}
</style>
