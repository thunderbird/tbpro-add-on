<script setup lang="ts">
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import { ref } from 'vue';

import CreateAccessLink from '@send-frontend/apps/send/components/CreateAccessLink.vue';
import FolderAccessLinksList from '@send-frontend/apps/send/components/FolderAccessLinksList.vue';
import FolderNameForm from '@send-frontend/apps/send/elements/FolderNameForm.vue';
import { formatBytes } from '@send-frontend/lib/utils';

const folderStore = useFolderStore();

// const { currentFolder } = inject('folderManager');
// const { sharedByMe } = inject('sharingManager');

// const recipients = computed(() => {
//   const contacts = {};
//   sharedByMe.value
//     .filter((share) => share.containerId === folderStore.selectedFolder.value.id)
//     .forEach((share) => {
//       console.log(`have a share`);
//       share.invitations.forEach((invitation) => {
//         contacts[invitation.recipientId] = invitation.recipient;
//       });
//     });
//   return Object.values(contacts);
// });

const showForm = ref(false);

// watchEffect(() => {
//   console.log(`🐓🐓🐓 ${folderStore.selectedFolder.value?.name}`);
//   showForm.value = false;
// });
</script>

<template>
  <div v-if="folderStore.selectedFolder" class="flex flex-col gap-6 h-full">
    <!-- info -->
    <header class="flex flex-col items-center gap-3 pt-6">
      <img src="@send-frontend/apps/send/assets/folder.svg" class="w-20 h-20" />
      <div class="font-semibold pt-4">
        <span v-if="!showForm" class="cursor-pointer" @click="showForm = true">
          {{ folderStore.selectedFolder.name }}
        </span>
        <FolderNameForm v-if="showForm" @rename-complete="showForm = false" />
      </div>
      <div class="text-xs">
        {{ formatBytes(folderStore.selectedFolder.size) }}
      </div>
    </header>
    <!-- sharing config -->
    <CreateAccessLink
      v-if="folderStore?.selectedFolder?.id"
      :folder-id="folderStore.selectedFolder.id"
    />
    <FolderAccessLinksList
      v-if="folderStore?.selectedFolder?.id"
      :folder-id="folderStore.selectedFolder.id"
    />
    <!-- people -->
    <!-- <section class="flex flex-col gap-2">
      <div class="font-semibold text-gray-600">Shared With</div>
      <div class="flex flex-wrap gap-1">
        <Avatar v-for="recipient in recipients" :key="recipient.id">
          {{ recipient.email.substring(0, 1) }}
        </Avatar>
      </div>
    </section> -->
    <!-- tags -->
    <!-- <section class="flex flex-col gap-2">
      <div class="font-semibold text-gray-600">Tags</div>
      <div class="flex flex-wrap gap-1">
        <TagLabel v-for="tag in folderStore.selectedFolder.tags" :color="tag.color"> {{ tag.name }}</TagLabel>
      </div>
    </section> -->
    <!-- meta -->
    <footer class="mt-auto flex flex-col gap-3">
      <label
        v-if="folderStore.selectedFolder.createdAt"
        class="flex flex-col gap-1"
      >
        <span class="text-xs font-semibold text-gray-600">Created</span>
        <div class="text-xs">{{ folderStore.selectedFolder.createdAt }}</div>
      </label>
      <label
        v-if="folderStore.selectedFolder.updatedAt"
        class="flex flex-col gap-1"
      >
        <span class="text-xs font-semibold text-gray-600">Modified</span>
        <div class="text-xs">{{ folderStore.selectedFolder.updatedAt }}</div>
      </label>
      <div class="flex justify-end gap-2">
        <!-- <Btn><IconDownload class="w-4 h-4" /></Btn> -->
        <!-- <Btn primary><IconShare class="w-4 h-4" /> Share</Btn> -->
      </div>
    </footer>
  </div>
</template>
