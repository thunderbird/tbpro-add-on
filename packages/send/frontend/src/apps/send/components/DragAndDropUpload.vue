<script setup lang="ts">
import CheckmarkIcon from '@send-frontend/apps/common/CheckmarkIcon.vue';
import DocumentIcon from '@send-frontend/apps/common/DocumentIcon.vue';
import ImageIcon from '@send-frontend/apps/common/ImageIcon.vue';
import RemoveIcon from '@send-frontend/apps/common/RemoveIcon.vue';
import ErrorUploading from '@send-frontend/apps/send/components/ErrorUploading.vue';
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import { constants } from 'tbpro-shared';
import { ERROR_MESSAGES } from '@send-frontend/lib/errorMessages';
import { NamedBlob } from '@send-frontend/lib/filesync';
import { useStatusStore } from '@send-frontend/stores';
import useApiStore from '@send-frontend/stores/api-store';
import { useDropZone } from '@vueuse/core';
import prettyBytes from 'pretty-bytes';
import { ref } from 'vue';
import ProgressBar from './ProgressBarV2.vue';

const folderStore = useFolderStore();
const { api } = useApiStore();
const dropZoneRef = ref();
const { progress } = useStatusStore();

const filesMetadata = ref(null);
const fileBlobs = ref<NamedBlob[]>([]);
const completedFiles = ref<
  Array<{
    name: string;
    size: number;
    type: string;
    lastModified: number;
    status: 'completed';
    uploadedAt: Date;
  }>
>([]);
const isUploading = ref(false);
const isError = ref(false);

function onDrop(files: File[] | null) {
  filesMetadata.value = [];
  fileBlobs.value = [];
  completedFiles.value = [];
  isError.value = false; // Reset error state

  // Early return if no files
  if (!files || files.length === 0) {
    filesMetadata.value = null;
    return;
  }

  // Check for oversized files before processing
  const oversizedFiles = Array.from(files).filter((file) => {
    const isOversized = file.size > constants.MAX_FILE_SIZE;
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

function removeFile(index: number, isCompleted = false) {
  try {
    if (isCompleted) {
      // Remove from completed files
      if (
        completedFiles.value &&
        index >= 0 &&
        index < completedFiles.value.length
      ) {
        completedFiles.value.splice(index, 1);
      }
    } else {
      // Remove from pending files
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
    }
  } catch (error) {
    console.error('Error removing file:', error);
  }
}

async function doUpload() {
  progress.error = '';
  progress.initialize();
  isError.value = false;
  isUploading.value = true;

  try {
    // Process files sequentially to properly track progress for each file
    const results = [];

    // Process files in reverse order so we can remove them without affecting indices
    for (let index = fileBlobs.value.length - 1; index >= 0; index--) {
      const blob = fileBlobs.value[index];
      const fileMetadata = filesMetadata.value[index];

      try {
        // Only set the file name and a high-level status message
        // Let the folder store and upload process handle the detailed progress tracking
        progress.setFileName(blob.name);
        progress.setText(
          `Processing ${blob.name}... (${fileBlobs.value.length - index}/${fileBlobs.value.length})`
        );

        const uploadResult = await folderStore.uploadItem(
          blob,
          folderStore.rootFolder.id,
          api
        );

        results.push(uploadResult);

        // Move the file from pending to completed
        const completedFile = {
          ...fileMetadata,
          status: 'completed' as const,
          uploadedAt: new Date(),
        };
        completedFiles.value.unshift(completedFile); // Add to beginning of completed list

        // Remove from pending lists
        filesMetadata.value.splice(index, 1);
        fileBlobs.value.splice(index, 1);

        // Brief pause between files to show completion status
        if (index > 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Upload error for file ${index + 1}:`, error);
        progress.setProcessStage('error');
        progress.error = `Upload failed for ${blob.name}: ${error.message || 'Unknown error'}`;
        throw error;
      }
    }

    // Clear the pending files list if all uploads were successful
    if (results.length > 0 && filesMetadata.value.length === 0) {
      filesMetadata.value = null;
      fileBlobs.value = [];
      progress.setText(
        `Successfully uploaded ${results.length} file${results.length === 1 ? '' : 's'}`
      );

      // Reset progress after a brief delay
      setTimeout(() => {
        progress.initialize();
      }, 2000);
    }
  } catch {
    isError.value = true;
  } finally {
    isUploading.value = false;
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
  </div>

  <div>
    <div
      v-if="!isUploading && !isError"
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

    <!-- Display dropped files and completed files -->
    <div
      v-if="
        (filesMetadata && filesMetadata.length > 0) || completedFiles.length > 0
      "
      class="mt-4 w-full"
    >
      <!-- Pending files section -->
      <div v-if="filesMetadata && filesMetadata.length > 0">
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
            :key="`pending-${index}`"
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
              v-if="!isUploading"
              class="flex-shrink-0 p-2 ml-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
              type="button"
              :aria-label="`Remove ${file.name} from upload list`"
              @click="removeFile(index, false)"
            >
              <RemoveIcon />
            </button>
          </div>
        </div>
      </div>

      <!-- Completed files section -->
      <div v-if="completedFiles.length > 0" class="mt-4">
        <h3
          id="completed-files-heading"
          class="text-lg font-semibold mb-2 text-green-700"
        >
          Completed Uploads ({{ completedFiles.length }} file{{
            completedFiles.length === 1 ? '' : 's'
          }}):
        </h3>
        <div
          class="space-y-2 max-h-60 overflow-y-auto"
          role="list"
          aria-labelledby="completed-files-heading"
          aria-live="polite"
        >
          <div
            v-for="(file, index) in completedFiles"
            :key="`completed-${index}`"
            class="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200 w-full"
            role="listitem"
            :aria-label="`Completed upload: ${file.name}, ${prettyBytes(file.size)}`"
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
                  <span class="ml-2 text-green-600">• Uploaded</span>
                </p>
              </div>
              <!-- Success icon -->
              <div class="flex-shrink-0 text-green-500">
                <CheckmarkIcon />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <button
      v-if="
        folderStore.rootFolder &&
        filesMetadata &&
        filesMetadata.length > 0 &&
        !isError
      "
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
