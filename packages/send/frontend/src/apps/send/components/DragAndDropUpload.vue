<script setup lang="ts">
import ErrorUploading from '@/apps/send/components/ErrorUploading.vue';
import UploadingProgress from '@/apps/send/components/UploadingProgress.vue';
import useFolderStore from '@/apps/send/stores/folder-store';
import { MAX_FILE_SIZE } from '@/lib/const';
import { ERROR_MESSAGES } from '@/lib/errorMessages';
import { NamedBlob } from '@/lib/filesync';
import { useStatusStore } from '@/stores';
import useApiStore from '@/stores/api-store';
import { useDropZone } from '@vueuse/core';
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
  // Check for oversized files before processing
  const oversizedFiles = Array.from(files).filter((file) => {
    const isOversized = file.size > MAX_FILE_SIZE;
    return isOversized;
  });

  if (oversizedFiles.length > 0) {
    progress.error = ERROR_MESSAGES.SIZE_EXCEEDED;
    isError.value = true;
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
  <div v-if="isError">
    <ErrorUploading />
  </div>

  <div v-if="isUploading">
    <ProgressBar />
    <UploadingProgress />
  </div>

  <div v-else>
    <div
      id="drop-zone"
      ref="dropZoneRef"
      class="h-full"
      data-testid="drop-zone"
    >
      <slot></slot>
    </div>

    <button
      v-if="folderStore.rootFolder && filesMetadata && !isError"
      data-testid="upload-button"
      type="submit"
      class="inline-flex items-center justify-center rounded-lg px-4 py-3 transition duration-500 ease-in-out text-white bg-blue-500 hover:bg-blue-400 focus:outline-none"
      @click="doUpload"
    >
      <span class="font-bold">Upload</span>
    </button>
  </div>
</template>
