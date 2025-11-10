<script setup lang="ts">
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import useSharingStore from '@send-frontend/apps/send/stores/sharing-store';
import init from '@send-frontend/lib/init';
import useApiStore from '@send-frontend/stores/api-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import useUserStore from '@send-frontend/stores/user-store';
import { onMounted, ref } from 'vue';

interface FileItem {
  id: number;
  name: string;
  data: File;
}

const props = withDefaults(
  defineProps<{
    files?: FileItem[] | null;
    onUploadAndShare?: (
      files: FileItem[],
      password: string,
      expiration?: string,
      onStatusUpdate?: (
        fileIndex: number,
        status: 'pending' | 'uploading' | 'completed' | 'error'
      ) => void
    ) => Promise<void>;
  }>(),
  {
    files: null,
    onUploadAndShare: undefined,
  }
);

import { useMetricsUpdate } from '@send-frontend/apps/common/mixins/metrics';
import {
  ALL_UPLOADS_ABORTED,
  ALL_UPLOADS_COMPLETE,
} from '@send-frontend/lib/const';
import { organizeFiles } from '@send-frontend/lib/folderView';
import { ExpirationOption, getExpirationDate } from '@send-frontend/lib/utils';
import { useConfigStore } from '@send-frontend/stores';
import useMetricsStore from '@send-frontend/stores/metrics';
import ErrorStep from '../components/upload-steps/ErrorStep.vue';
import ExpirationStep from '../components/upload-steps/ExpirationStep.vue';
import PasswordStep from '../components/upload-steps/PasswordStep.vue';
import SuccessStep from '../components/upload-steps/SuccessStep.vue';
import UploadingStep from '../components/upload-steps/UploadingStep.vue';
import { useStatusStore } from '../stores/status-store';

const userStore = useUserStore();
const { keychain } = useKeychainStore();
const folderStore = useFolderStore();
const sharingStore = useSharingStore();
const { api } = useApiStore();
const { initializeClientMetrics } = useMetricsStore();
const { progress } = useStatusStore();
const { isThunderbirdHost } = useConfigStore();

type Step = 'password' | 'expiration' | 'uploading' | 'success' | 'error';

// Current step
const currentStep = ref<Step>('password');

// Step 1: Password state
const password = ref('');
const passwordHint = ref('');
const isPasswordProtected = ref(true);

// Step 2: Expiration state
const selectedExpiration = ref<ExpirationOption>('14days');
const customDateTime = ref('');

// Upload state
const isUploading = ref(false);
const uploadError = ref('');
const shareUrl = ref('');

// File upload status tracking
interface FileUploadStatus {
  name: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
}
const fileUploadStatuses = ref<FileUploadStatus[]>([]);

// Dummy file for testing
const dummyFile = ref<File | null>(null);

// Check if running in extension or web
const isExtension = isThunderbirdHost;

function handleNext() {
  currentStep.value = 'expiration';
}

function handleBack() {
  currentStep.value = 'password';
}

function handleClose() {
  // Reset everything
  currentStep.value = 'password';
  password.value = '';
  passwordHint.value = '';
  isPasswordProtected.value = true;
  selectedExpiration.value = '14days';
  uploadError.value = '';
  shareUrl.value = '';
  fileUploadStatuses.value = [];
  progress.initialize();
}

function setExpiredForTesting() {
  selectedExpiration.value = 'custom';
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 10);

  // Format for datetime-local input: YYYY-MM-DDTHH:mm
  const year = pastDate.getFullYear();
  const month = String(pastDate.getMonth() + 1).padStart(2, '0');
  const day = String(pastDate.getDate()).padStart(2, '0');
  const hours = String(pastDate.getHours()).padStart(2, '0');
  const minutes = String(pastDate.getMinutes()).padStart(2, '0');
  customDateTime.value = `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function handleCreateLink() {
  currentStep.value = 'uploading';
  isUploading.value = true;
  uploadError.value = '';

  try {
    // Use provided files or create dummy file if none exist
    const filesToUpload =
      props.files && props.files.length > 0 ? props.files : null;

    // Initialize file upload statuses
    if (filesToUpload) {
      fileUploadStatuses.value = filesToUpload.map((file) => ({
        name: file.name,
        status: 'pending' as const,
      }));
    } else if (!dummyFile.value) {
      // Create dummy file first so we know the name
      const dummyContent =
        'This is a test file created for demonstration purposes.\n'.repeat(100);
      const blob = new Blob([dummyContent], { type: 'text/plain' });
      dummyFile.value = new File([blob], 'test-document.txt', {
        type: 'text/plain',
      });
      fileUploadStatuses.value = [
        { name: 'test-document.txt', status: 'pending' as const },
      ];
    }

    // In extension mode with custom upload handler, use that instead
    if (isExtension && props.onUploadAndShare && filesToUpload) {
      const finalPassword = isPasswordProtected.value ? password.value : '';
      const expirationDate = getExpirationDate(
        selectedExpiration.value,
        customDateTime.value
      );

      // Pass status update callback
      await props.onUploadAndShare(
        filesToUpload,
        finalPassword,
        expirationDate,
        (
          fileIndex: number,
          status: 'pending' | 'uploading' | 'completed' | 'error'
        ) => {
          if (fileUploadStatuses.value[fileIndex]) {
            fileUploadStatuses.value[fileIndex].status = status;
          }
        }
      );
      return;
    }

    const rootFolderId = await folderStore.getDefaultFolderId();
    let uploadedItems = [];

    if (filesToUpload) {
      // Upload all files from props
      for (let i = 0; i < filesToUpload.length; i++) {
        const fileItem = filesToUpload[i];
        fileUploadStatuses.value[i].status = 'uploading';

        const items = await folderStore.uploadItem(
          fileItem.data,
          rootFolderId,
          api
        );
        if (items && items.length > 0) {
          uploadedItems.push(...items);
          fileUploadStatuses.value[i].status = 'completed';
        }
      }
    } else {
      // Create and upload dummy file only if no files provided
      if (!dummyFile.value) {
        const dummyContent =
          'This is a test file created for demonstration purposes.\n'.repeat(
            100
          );
        const blob = new Blob([dummyContent], { type: 'text/plain' });
        dummyFile.value = new File([blob], 'test-document.txt', {
          type: 'text/plain',
        });
      }
      fileUploadStatuses.value[0].status = 'uploading';
      const items = await folderStore.uploadItem(
        dummyFile.value,
        rootFolderId,
        api
      );
      if (items && items.length > 0) {
        uploadedItems.push(...items);
        fileUploadStatuses.value[0].status = 'completed';
      }
    }

    if (!uploadedItems || uploadedItems.length === 0) {
      throw new Error('Could not upload file');
    }

    // Organize files for sharing
    const organizedFiles = organizeFiles(uploadedItems);

    // Share the items with optional password and expiration
    const finalPassword = isPasswordProtected.value ? password.value : '';
    const expirationDate = getExpirationDate(
      selectedExpiration.value,
      customDateTime.value
    );
    const url = await sharingStore.shareItems(
      organizedFiles,
      finalPassword,
      expirationDate
    );

    if (!url) {
      throw new Error('Did not get URL back from sharing');
    }

    shareUrl.value = url;

    // In extension mode, send message to background and close window
    if (isExtension) {
      browser.runtime.sendMessage({
        type: ALL_UPLOADS_COMPLETE,
        url,
        results: uploadedItems,
        aborted: false,
      });
      window.close();
    } else {
      // On web, show success screen
      currentStep.value = 'success';
    }
  } catch (error) {
    console.error('Upload/Share failed:', error);
    uploadError.value = error.message || 'Upload failed. Please try again.';

    // In extension mode, send abort message
    if (isExtension) {
      browser.runtime.sendMessage({
        type: ALL_UPLOADS_ABORTED,
        aborted: true,
      });
      window.close();
    } else {
      // On web, show error screen
      currentStep.value = 'error';
    }
  } finally {
    isUploading.value = false;
  }
}

function handleRetry() {
  currentStep.value = 'expiration';
  uploadError.value = '';
  progress.initialize();
}

function copyToClipboard() {
  if (typeof window !== 'undefined' && window.navigator?.clipboard) {
    window.navigator.clipboard.writeText(shareUrl.value);
  }
}

onMounted(async () => {
  await init(userStore, keychain, folderStore);
  // Identify user for analytics
  const uid = userStore.user.uniqueHash;
  initializeClientMetrics(uid);
});

useMetricsUpdate();
</script>

<template>
  <div id="send-page" class="container">
    <!-- Step 1: Password -->
    <PasswordStep
      v-if="currentStep === 'password'"
      v-model:is-password-protected="isPasswordProtected"
      v-model:password="password"
      v-model:password-hint="passwordHint"
      @next="handleNext"
      @close="handleClose"
    />

    <!-- Step 2: Expiration -->
    <ExpirationStep
      v-if="currentStep === 'expiration'"
      v-model:selected-expiration="selectedExpiration"
      v-model:custom-date-time="customDateTime"
      :is-extension="isExtension"
      @back="handleBack"
      @close="handleClose"
      @create-link="handleCreateLink"
      @set-expired-for-testing="setExpiredForTesting"
    />

    <!-- Step 3: Uploading -->
    <UploadingStep
      v-if="currentStep === 'uploading'"
      :file-upload-statuses="fileUploadStatuses"
    />

    <!-- Step 4: Success (only on web, not in extension) -->
    <SuccessStep
      v-if="currentStep === 'success' && !isExtension"
      :share-url="shareUrl"
      @close="handleClose"
      @copy-to-clipboard="copyToClipboard"
    />

    <!-- Step 5: Error (only on web, not in extension) -->
    <ErrorStep
      v-if="currentStep === 'error' && !isExtension"
      :upload-error="uploadError"
      @close="handleClose"
      @retry="handleRetry"
    />
  </div>
</template>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem 0;
}
</style>
