<script setup lang="ts">
import useFolderStore from '@send-frontend/apps/send/stores/folder-store';

import Btn from '@send-frontend/apps/send/elements/BtnComponent.vue';
import { IconPlus } from '@tabler/icons-vue';

const folderStore = useFolderStore();
</script>

<template>
  <!-- Only show button outside of profile page -->
  <div v-if="isInProfileView">
    <Btn
      primary
      data-testid="new-folder-button"
      @click="folderStore.createFolder()"
    >
      <IconPlus class="w-5 h-5 stroke-2" />
      New Folder
    </Btn>
  </div>
</template>

<script lang="ts">
export default {
  computed: {
    isInProfileView() {
      // Check if we're not in the profile view
      return !this.$route.path.includes('profile');
    },
  },
};
</script>
