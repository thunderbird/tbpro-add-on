<script setup lang="ts">
import ErrorGeneric from '@send-frontend/apps/common/errors/ErrorGeneric.vue';
import BtnComponent from '@send-frontend/apps/send/elements/BtnComponent.vue';
import { useL10n } from '@send-frontend/l10n';
import { ref } from 'vue';

const { closefn, confirm, itemName, itemType } = defineProps<{
  closefn: () => Promise<string>;
  confirm: () => Promise<boolean | void>;
  itemName: string;
  itemType: 'folder' | 'file';
}>();

const { t, tAround } = useL10n();
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
      {{ tAround('send-confirm-delete-question', 'name', { type: itemType })[0]
      }}<strong class="text-red-600">{{ itemName }}</strong
      >{{
        tAround('send-confirm-delete-question', 'name', { type: itemType })[1]
      }}
    </p>
    <p v-if="itemType === 'folder'" class="mt-2 text-sm text-gray-600">
      {{ t('send-confirm-delete-contents') }}
    </p>
    <p class="mt-2 text-sm text-gray-600">
      {{ t('send-confirm-delete-irreversible') }}
    </p>
    <div class="flex justify-center space-x-4 mt-8">
      <BtnComponent danger :disabled="isDeleting" @click="onConfirm">
        {{
          t('send-confirm-delete-button', {
            state: isDeleting ? 'deleting' : 'idle',
          })
        }}
      </BtnComponent>
      <BtnComponent :disabled="isDeleting" @click="closefn">{{
        t('send-confirm-delete-cancel')
      }}</BtnComponent>
    </div>
  </div>
</template>

<style scoped>
* {
  max-width: 400px;
}
</style>
