<!-- eslint-disable vue/no-use-v-if-with-v-for -->
<script setup lang="ts">
import { DayJsKey } from '@/types';
import { inject, onMounted, ref, watch } from 'vue';

import useFolderStore from '@/apps/send/stores/folder-store';
import '@thunderbirdops/services-ui/style.css';

import DeleteModal from '@/apps/common/modals/DeleteModal.vue';
import DownloadModal from '@/apps/common/modals/DownloadModal.vue';
import BreadCrumb from '@/apps/send/components/BreadCrumb.vue';
import Btn from '@/apps/send/elements/BtnComponent.vue';
import FolderTableRowCell from '@/apps/send/elements/FolderTableRowCell.vue';
import { IconDotsVertical, IconDownload, IconTrash } from '@tabler/icons-vue';
import { ExpiryBadge, ExpiryUnitTypes } from '@thunderbirdops/services-ui';
import { useDebounceFn } from '@vueuse/core';
import { useModal, useModalSlot } from 'vue-final-modal';
import { useRoute, useRouter } from 'vue-router';
import { ItemResponse } from '../stores/folder-store.types';
import DeleteConfirmation from './DeleteConfirmation.vue';
import DownloadConfirmation from './DownloadConfirmation.vue';

const folderStore = useFolderStore();

const dayjs = inject(DayJsKey);
const selectedFolder = ref<string | null>(null);

const route = useRoute();
const router = useRouter();
const itemRef = ref<ItemResponse>();
const deleteItemRef = ref<{
  id: string | number;
  name: string;
  type: 'folder' | 'file';
}>();

const onDownloadConfirm = () =>
  folderStore.downloadContent(
    itemRef.value.uploadId,
    itemRef.value.containerId,
    itemRef.value.wrappedKey,
    itemRef.value.name
  );

const onDeleteConfirm = async () => {
  if (deleteItemRef.value?.type === 'folder') {
    return await folderStore.deleteFolder(deleteItemRef.value.id as string);
  } else {
    return await folderStore.deleteItem(
      deleteItemRef.value.id as number,
      folderStore.rootFolder.id
    );
  }
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
        closefn: () => closefn(),
        confirm: onDownloadConfirm,
      },
    }),
  },
});

const { open: openDeleteModal, close: closeDeleteModal } = useModal({
  component: DeleteModal,
  attrs: {
    title: 'Delete Item?',
  },
  slots: {
    default: useModalSlot({
      component: DeleteConfirmation,
      attrs: {
        closefn: () => closeDeleteModal(),
        confirm: onDeleteConfirm,
        get itemName() {
          return deleteItemRef.value?.name || '';
        },
        get itemType() {
          return deleteItemRef.value?.type || 'file';
        },
      },
    }),
  },
});

const openModal = (item: ItemResponse) => {
  itemRef.value = item;
  open();
};

const openDeleteConfirmation = (
  id: string | number,
  name: string,
  type: 'folder' | 'file'
) => {
  deleteItemRef.value = { id, name, type };
  openDeleteModal();
};

const gotoRoute = useDebounceFn(() => {
  const id = route.params.id as string;
  if (!!id) {
    folderStore.goToRootFolder(id);
    return;
  }
  folderStore.goToRootFolder(null);
}, 1);

onMounted(() => {
  gotoRoute();
});

watch(
  () => route.params.id,
  (newId, oldId) => {
    if (newId !== oldId) {
      gotoRoute();
    }
  }
);

function handleFolderClick(uuid: string) {
  if (selectedFolder.value === uuid) {
    router.push({ name: 'folder', params: { id: uuid } });
    selectedFolder.value = null;
    return;
  }
  folderStore.setSelectedFolder(uuid);
  selectedFolder.value = uuid;
}

function handleFileClick(id: number) {
  folderStore.setSelectedFile(id);
}
</script>
<script lang="ts">
export default { props: { id: { type: String, default: 'null' } } };
</script>
<template>
  <div class="w-full flex flex-col gap-3">
    <h2 class="font-bold">Your Files</h2>
    <span
      v-if="folderStore.rootFolder?.items.length"
      data-testid="file-count"
      style="display: none"
    >
      {{ `${folderStore.rootFolder.items.length}` }}
    </span>
    <BreadCrumb />
    <table class="w-full border-separate border-spacing-x-0 border-spacing-y-1">
      <thead>
        <tr>
          <th class="border-r border-b border-gray-300"></th>
          <th class="border-r border-b border-gray-300">Name</th>
          <th class="border-b border-gray-300"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="folder in folderStore.visibleFolders"
          :key="folder.id"
          class="group cursor-pointer"
          data-testid="folder-row"
          @click="handleFolderClick(folder.id)"
          @dblclick="router.push({ name: 'folder', params: { id: folder.id } })"
        >
          <FolderTableRowCell
            :selected="folder.id === folderStore.selectedFolder?.id"
          >
            <img src="@/apps/send/assets/folder.svg" class="w-8 h-8" />
          </FolderTableRowCell>
          <FolderTableRowCell
            :selected="folder.id === folderStore.selectedFolder?.id"
          >
            <div>{{ folder.name }}</div>
            <div class="text-sm">
              Last modified {{ dayjs().to(dayjs(folder.updatedAt)) }}
            </div>
          </FolderTableRowCell>
          <FolderTableRowCell
            :selected="folder.id === folderStore.selectedFolder?.id"
          >
            <div class="flex justify-between">
              <div
                class="flex gap-2 opacity-0 group-hover:!opacity-100 transition-opacity"
                :class="{
                  '!opacity-100': folder.id === folderStore.selectedFolder?.id,
                }"
              >
                <Btn
                  danger
                  @click.stop="
                    openDeleteConfirmation(folder.id, folder.name, 'folder')
                  "
                >
                  <IconTrash class="w-4 h-4" />
                </Btn>
              </div>
              <Btn class="ml-auto">
                <IconDotsVertical class="w-4 h-4" />
              </Btn>
            </div>
          </FolderTableRowCell>
        </tr>
        <template v-if="folderStore.rootFolder">
          <tr
            v-for="item in folderStore.rootFolder.items"
            :key="item.id"
            class="group cursor-pointer"
            @click="handleFileClick(item.id)"
          >
            <FolderTableRowCell>
              <div class="flex justify-end">
                <img src="@/apps/send/assets/file.svg" class="w-8 h-8" />
              </div>
            </FolderTableRowCell>
            <FolderTableRowCell>
              <div>{{ item.name }}</div>
              <div class="text-sm">
                Last modified {{ dayjs().to(dayjs(item.updatedAt)) }}
              </div>
              <ExpiryBadge
                v-if="item.upload.daysToExpiry !== undefined"
                :time-remaining="item.upload.daysToExpiry"
                :warning-threshold="10"
                :time-unit="ExpiryUnitTypes.Days"
                class="my-2"
              />
            </FolderTableRowCell>
            <FolderTableRowCell>
              <div class="flex justify-between">
                <div
                  class="flex gap-2 opacity-0 group-hover:!opacity-100 transition-opacity"
                >
                  <Btn
                    v-if="!item.upload.expired"
                    secondary
                    @click="openModal(item)"
                  >
                    <IconDownload class="w-4 h-4" />
                  </Btn>
                  <Btn
                    v-if="!item.upload.expired"
                    data-testid="delete-file"
                    danger
                    @click.stop="
                      openDeleteConfirmation(item.id, item.name, 'file')
                    "
                  >
                    <IconTrash class="w-4 h-4" />
                  </Btn>
                </div>
                <Btn class="ml-auto">
                  <IconDotsVertical class="w-4 h-4" />
                </Btn>
              </div>
            </FolderTableRowCell>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
