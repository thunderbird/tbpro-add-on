<script setup lang="ts">
import useFolderStore from '@/apps/send/stores/folder-store';
import { ref, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
const folderStore = useFolderStore();

const path = ref([]);
const router = useRouter();

watchEffect(() => {
  path.value = [folderStore.rootFolder];
  let parent = folderStore.rootFolder?.parent;
  while (parent) {
    path.value.unshift(parent);
    parent = parent.parent;
  }
});
</script>

<template>
  <nav aria-label="Breadcrumb navigation">
    <ol class="breadcrumb-list">
      <template v-if="folderStore.rootFolder">
        <li
          v-for="(folder, index) of path"
          :key="folder.id"
          class="breadcrumb-item"
        >
          <!-- We just want to show the separator with more than one item -->
          <span class="breadcrumb-separator" aria-hidden="true">{{
            index !== 0 ? '&gt;' : ''
          }}</span>
          <button
            :aria-label="`Go to ${folder.name} folder`"
            :aria-current="index === path.length - 1 ? 'page' : undefined"
            class="breadcrumb-button"
            :data-testid="index !== 0 ? 'breadcrumb-item' : 'home-button'"
            @click.prevent="
              router.push({ name: 'folder', params: { id: folder.id } })
            "
          >
            {{ folder.id === folderStore.rootFolderId ? '🏠' : folder.name }}
          </button>
        </li>
      </template>
    </ol>
  </nav>
</template>

<style scoped>
.breadcrumb-list {
  display: flex;
  align-items: center;
  list-style: none;
  margin: 0;
  padding: 0;
}

.breadcrumb-list li {
  display: flex;
  align-items: center;
}

.breadcrumb-button {
  user-select: none;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.25rem;
  transition: background-color 0.2s;
}

.breadcrumb-button:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

.breadcrumb-button:focus {
  outline: 2px solid #007acc;
  outline-offset: 2px;
}

.breadcrumb-separator {
  margin: 0 0.5rem;
  color: #666;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
}
</style>
