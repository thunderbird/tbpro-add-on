<script setup lang="ts">
import ErrorGeneric from '@/apps/common/errors/ErrorGeneric.vue';
import BtnComponent from '@/apps/send/elements/BtnComponent.vue';
import { ref } from 'vue';

const { closefn, confirm, itemName, itemType } = defineProps<{
  closefn: () => Promise<string>;
  confirm: () => Promise<boolean | void>;
  itemName: string;
  itemType: 'folder' | 'file';
}>();

const isDeleting = ref(false);
const isError = ref<string>();

const onConfirm = async () => {
  isDeleting.value = true;
  try {
    await confirm();
    closefn();
  } catch (e) {
    console.log(e);
    isError.value = e;
  } finally {
    isDeleting.value = false;
  }
};
</script>

<template>
  <div v-if="isError">
    <ErrorGeneric :error-message="isError" />
  </div>
  <div v-else>
    <p>
      Are you sure you want to delete the {{ itemType }}
      <strong class="text-red-600">"{{ itemName }}"</strong>?
    </p>
    <p v-if="itemType === 'folder'" class="mt-2 text-sm text-gray-600">
      This will also delete all files and folders contained within it.
    </p>
    <p class="mt-2 text-sm text-gray-600">This action cannot be undone.</p>
    <div class="flex justify-center space-x-4 mt-8">
      <BtnComponent danger :disabled="isDeleting" @click="onConfirm">
        {{ isDeleting ? 'Deleting...' : 'Yes, Delete' }}
      </BtnComponent>
      <BtnComponent :disabled="isDeleting" @click="closefn"
        >Cancel</BtnComponent
      >
    </div>
  </div>
</template>

<style scoped>
* {
  max-width: 400px;
}
</style>
