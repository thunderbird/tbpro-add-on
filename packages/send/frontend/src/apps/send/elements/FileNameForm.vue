<script setup lang="ts">
import Btn from '@send-frontend/apps/send/elements/BtnComponent.vue';
import { onMounted, ref, watch } from 'vue';

const emit = defineEmits(['renameComplete']);

import useFolderStore from '@send-frontend/apps/send/stores/folder-store';

const folderStore = useFolderStore();

const selectedFileName = ref(folderStore.selectedFile.name);
const input = ref(null);

async function updateFileName() {
  const result = await folderStore.renameItem(
    folderStore.selectedFile.containerId,
    folderStore.selectedFile.id,
    selectedFileName.value
  );
  if (result) {
    emit('renameComplete');
  }
}

function resetForm() {
  selectedFileName.value = folderStore.selectedFile.name;
  emit('renameComplete');
}

watch(
  () => folderStore.selectedFile,
  () => {
    resetForm();
  }
);

onMounted(() => {
  input.value.focus();
  input.value.select();
});
</script>

<template>
  <form @submit.prevent="updateFileName">
    <input
      ref="input"
      v-model="selectedFileName"
      type="text"
      @keydown.esc="resetForm"
    />
    <div class="flex flex-row justify-end">
      <Btn @click.prevent="updateFileName">Rename</Btn>
    </div>
  </form>
</template>
