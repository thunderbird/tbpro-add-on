<script setup lang="ts">
import DocumentIcon from '@/apps/common/DocumentIcon.vue';
import ImageIcon from '@/apps/common/ImageIcon.vue';
import RemoveIcon from '@/apps/common/RemoveIcon.vue';
import ErrorUploading from '@/apps/send/components/ErrorUploading.vue';
import UploadingProgress from '@/apps/send/components/UploadingProgress.vue';
import useFolderStore from '@/apps/send/stores/folder-store';
import { MAX_FILE_SIZE } from '@/lib/const';
import { ERROR_MESSAGES } from '@/lib/errorMessages';
import { NamedBlob } from '@/lib/filesync';
import { useStatusStore } from '@/stores';
import useApiStore from '@/stores/api-store';
import { useDropZone } from '@vueuse/core';
import prettyBytes from 'pretty-bytes';
import { ref } from 'vue';
import ProgressBar from './ProgressBar.vue';

const folderStore = useFolderStore();
const { api } = useApiStore();
const dropZoneRef = ref();
const { progress } = useStatusStore();

const filesMetadata = ref(null);
const fileBlobs = ref<NamedBlob[]>([]);
const isUploading = ref(false);
const isError = ref(false);

function onDrop(files: File[] | null) {
  filesMetadata.value = [];
  fileBlobs.value = [];
  isError.value = false; // Reset error state

  // Early return if no files
  if (!files || files.length === 0) {
    filesMetadata.value = null;
    return;
  }

  // Check for oversized files before processing
  const oversizedFiles = Array.from(files).filter((file) => {
    const isOversized = file.size > MAX_FILE_SIZE;
    return isOversized;
  });

  if (oversizedFiles.length > 0) {
    progress.error = ERROR_MESSAGES.SIZE_EXCEEDED;
    isError.value = true;
    return; // Don't process any files if some are oversized
  }

  try {
    filesMetadata.value = Array.from(files).map((file) => {
      // File objects already implement the NamedBlob interface
      // (File extends Blob and has a name property)
      // No need to create a new Blob or modify the name property
      fileBlobs.value.push(file as NamedBlob);

      return {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      };
    });
  } catch (error) {
    console.error('Error in onDrop processing:', error);
    progress.error = `Error processing files: ${error.message}`;
    isError.value = true;
  }
}

useDropZone(dropZoneRef, onDrop);

function removeFile(index: number) {
  try {
    if (
      filesMetadata.value &&
      fileBlobs.value &&
      index >= 0 &&
      index < filesMetadata.value.length
    ) {
      filesMetadata.value.splice(index, 1);
      fileBlobs.value.splice(index, 1);

      // If no files left, clear the arrays
      if (filesMetadata.value.length === 0) {
        filesMetadata.value = null;
        fileBlobs.value = [];
      }

      // Clear any existing errors when files are removed
      if (
        isError.value &&
        filesMetadata.value &&
        filesMetadata.value.length > 0
      ) {
        isError.value = false;
        progress.error = '';
      }
    }
  } catch (error) {
    console.error('Error removing file:', error);
  }
}

async function doUpload() {
  progress.error = '';
  isError.value = false;

  const result = await Promise.all(
    fileBlobs.value.map(async (blob, index) => {
      isUploading.value = true;
      try {
        const uploadResult = await folderStore.uploadItem(
          blob,
          folderStore.rootFolder.id,
          api
        );
        isUploading.value = false;
        return uploadResult;
      } catch (error) {
        console.error(`Upload error for file ${index + 1}:`, error);
        isError.value = true;
        isUploading.value = false;
        progress.error = `Upload failed for ${blob.name}: ${error.message || 'Unknown error'}`;
        return null;
      }
    })
  );

  // Only clear the file list if all uploads were successful
  const successfulUploads = result.filter((r) => r !== null);
  if (successfulUploads.length >= fileBlobs.value.length) {
    filesMetadata.value = null;
  }
}
</script>

<template>
  <div v-if="isError" role="alert" aria-live="assertive">
    <ErrorUploading />
  </div>

  <div
    v-if="isUploading"
    role="status"
    aria-live="polite"
    aria-label="Files are being uploaded"
  >
    <ProgressBar />
    <UploadingProgress />
  </div>

  <div v-else>
    <div
      id="drop-zone"
      ref="dropZoneRef"
      class="h-full"
      data-testid="drop-zone"
      role="button"
      tabindex="0"
      aria-label="Drop files here or click to select files for upload"
      aria-describedby="drop-zone-instructions"
    >
      <slot></slot>
      <!-- Call out instructions for screen readers -->
      <div id="drop-zone-instructions" class="sr-only">
        Drop files here to upload them
      </div>
    </div>

    <!-- Display dropped files -->
    <div v-if="filesMetadata && filesMetadata.length > 0" class="mt-4 w-full">
      <h3 id="selected-files-heading" class="text-lg font-semibold mb-2">
        Selected Files ({{ filesMetadata.length }} file{{
          filesMetadata.length === 1 ? '' : 's'
        }}):
      </h3>
      <div
        class="space-y-2 max-h-60 overflow-y-auto"
        role="list"
        aria-labelledby="selected-files-heading"
        aria-live="polite"
      >
        <div
          v-for="(file, index) in filesMetadata"
          :key="index"
          class="flex items-center justify-between p-3 bg-gray-100 rounded-lg border w-full"
          role="listitem"
          :aria-label="`File ${index + 1} of ${filesMetadata.length}: ${file.name}, ${prettyBytes(file.size)}`"
        >
          <div class="flex items-center space-x-3 flex-1 min-w-0">
            <div class="flex-shrink-0">
              <!-- File icon based on type -->
              <ImageIcon v-if="file.type.startsWith('image/')" />
              <DocumentIcon v-else />
            </div>
            <div class="flex-1 min-w-0 overflow-hidden">
              <p
                class="text-sm font-medium text-gray-900 truncate"
                :title="file.name"
              >
                {{ file.name }}
              </p>
              <p class="text-sm text-gray-500 truncate">
                {{ prettyBytes(file.size) }}
                <span v-if="file.type" class="ml-2">• {{ file.type }}</span>
              </p>
            </div>
          </div>
          <button
            class="flex-shrink-0 p-2 ml-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
            type="button"
            :aria-label="`Remove ${file.name} from upload list`"
            @click="removeFile(index)"
          >
            <RemoveIcon />
          </button>
        </div>
      </div>
    </div>

    <button
      v-if="folderStore.rootFolder && filesMetadata && !isError"
      data-testid="upload-button"
      type="submit"
      class="inline-flex items-center justify-center rounded-lg px-4 py-3 transition duration-500 ease-in-out text-white bg-blue-500 hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 mt-4"
      :aria-label="`Upload ${filesMetadata.length} selected file${filesMetadata.length === 1 ? '' : 's'}`"
      :disabled="isUploading"
      @click="doUpload"
    >
      <span class="font-bold"
        >Upload {{ filesMetadata.length }} File{{
          filesMetadata.length === 1 ? '' : 's'
        }}</span
      >
    </button>
  </div>
</template>
