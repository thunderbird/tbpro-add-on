<script setup lang="ts">
import DownloadModal from '@send-frontend/apps/common/modals/DownloadModal.vue';
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import { useStatusStore } from '@send-frontend/apps/send/stores/status-store';
import {
  computeMultipartFile,
  handleMultipartDownload,
} from '@send-frontend/lib/folderView';
import { useApiStore, useKeychainStore } from '@send-frontend/stores';
import { computed, ref } from 'vue';
import { useModal, useModalSlot } from 'vue-final-modal';
import { FolderResponse, Item } from '../stores/folder-store.types';
import DownloadInfo from '../views/DownloadInfo.vue';
import DownloadConfirmation from './DownloadConfirmation.vue';
const folderStore = useFolderStore();
const statusStore = useStatusStore();
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
      keychain,
      statusStore.progress
    );
  }

  return folderStore.downloadContent(uploadId, containerId, wrappedKey, name);
};

const { open, close: closefn } = useModal({
  component: DownloadModal,
  slots: {
    default: useModalSlot({
      component: DownloadConfirmation,
      attrs: {
        closefn: () => {
          selectedFile.value = null;
          return closefn();
        },
        confirm: onDownloadConfirm,
      },
    }),
  },
});

async function setDownload(item: Item) {
  selectedFile.value = item;
}
</script>
<template>
  <div v-for="(item, i) in filesInFolder" :key="item.uploadId">
    <DownloadInfo
      :id="item?.upload?.id"
      :index="i"
      :sender="folder?.owner?.thundermailEmail"
      :filename="item?.name"
      :filesize="item?.upload?.size"
      :days-to-expiry="item?.upload?.daysToExpiry"
      :created-at="item?.createdAt"
      :hash="item?.upload?.fileHash"
      :container-id="containerId"
      :handle-download="
        () => {
          open();
          setDownload(item);
        }
      "
    ></DownloadInfo>
  </div>

  <div v-if="!folder?.items?.length">
    <p data-testid="not_found">
      This link is no longer active. Please reach out to the sender for a new
      download link.
    </p>
  </div>
</template>

<style scoped>
li {
  outline: 1px solid grey;
  margin: 1em auto;
  padding: 0.5rem;
}
</style>
