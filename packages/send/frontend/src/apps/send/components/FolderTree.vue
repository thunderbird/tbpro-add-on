<script setup lang="ts">
import DownloadModal from '@/apps/common/modals/DownloadModal.vue';
import ReportContent from '@/apps/send/components/ReportContent.vue';
import useFolderStore from '@/apps/send/stores/folder-store';
import {
  computeMultipartFile,
  handleMultipartDownload,
} from '@/lib/folderView';
import { useApiStore, useKeychainStore } from '@/stores';
import prettyBytes from 'pretty-bytes';
import { computed, ref } from 'vue';
import { useModal, useModalSlot } from 'vue-final-modal';
import { FolderResponse, Item } from '../stores/folder-store.types';
import DownloadConfirmation from './DownloadConfirmation.vue';
const folderStore = useFolderStore();
const { api } = useApiStore();
const { keychain } = useKeychainStore();

type ReportProps = {
  folder: FolderResponse;
  containerId: FolderResponse['id'];
};

const selectedFile = ref<Item>();
const multipartFile = computed(() => {
  return computeMultipartFile(selectedFile.value.wrappedKey, folder.items);
});
// const isError = ref(false);

const { containerId, folder } = defineProps<ReportProps>();

const filesInFolder = computed(() => {
  // return organizeFiles(folder?.items || []);
  return folder.items;
});

const onDownloadConfirm = () => {
  const item = selectedFile.value;
  const { id, uploadId, wrappedKey, name, containerId, multipart } = item;

  if (multipart) {
    folderStore.setSelectedFile(id);
    return handleMultipartDownload(
      multipartFile.value,
      item,
      folderStore.downloadMultipart,
      api,
      keychain
    );
  }

  return folderStore.downloadContent(uploadId, containerId, wrappedKey, name);
};

const { open, close: closefn } = useModal({
  component: DownloadModal,
  attrs: {
    title: 'Download File?',
  },
  slots: {
    default: useModalSlot({
      component: DownloadConfirmation,
      attrs: {
        closefn: () => {
          selectedFile.value = null;
          return closefn();
        },
        confirm: onDownloadConfirm,
        text: `Please note that you are downloading a file shared via Send. Send does not scan files for viruses, malware, or other harmful content. We recommend that you only download files from trusted sources and use your own virus protection software. Send is not responsible for any issues that may arise from this download.`,
      },
    }),
  },
});

async function setDownload(item: Item) {
  selectedFile.value = item;
}
</script>
<template>
  <ul v-if="folder">
    <div v-if="!folder?.items?.length">
      <p>This folder is empty or the files uploaded to it have expired</p>
    </div>
    <li v-for="(item, i) of filesInFolder" :key="item.uploadId">
      <div class="flex justify-between">
        <div>
          id: {{ item.uploadId }}<br />
          file name: {{ item.name }}<br />
          size: {{ prettyBytes(item.upload.size) }}<br />
          mime type: {{ item.upload.type }}<br />
        </div>
        <button
          type="submit"
          class="inline-flex items-center justify-center rounded-lg px-4 py-3 transition duration-500 ease-in-out text-white bg-blue-500 hover:bg-blue-400 focus:outline-none: disabled:bg-gray-400"
          @click.prevent="
            () => {
              open();
              setDownload(item);
            }
          "
        >
          <span :data-testid="`download-button-${i}`" class="font-bold"
            >Download</span
          >
        </button>
      </div>
      <div>
        <ReportContent :upload-id="item.uploadId" :container-id="containerId" />
      </div>
    </li>
  </ul>
</template>

<style scoped>
li {
  outline: 1px solid grey;
  margin: 1em auto;
  padding: 0.5rem;
}
</style>
