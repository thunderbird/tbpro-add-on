<script setup lang="ts">
import { TextArea } from '@thunderbirdops/services-ui';
import { configureFormStorage } from '@/composables/configureFormStorage';
import { useSettingsStore } from '@/stores/settings-store';
import SettingsForm from '@/components/options/SettingsForm.vue';
import { REPLY_CACHE_KEY, SUMMARY_PROMPT_CACHE_KEY } from '@/const';

type BannerOptionsForm = {
  [REPLY_CACHE_KEY]: string;
  [SUMMARY_PROMPT_CACHE_KEY]: string;
};

const settingsStore = useSettingsStore();

const { formData, loading, error, saveForm } = configureFormStorage<BannerOptionsForm>({
  load: async (): Promise<BannerOptionsForm> => ({
    [REPLY_CACHE_KEY]: settingsStore[REPLY_CACHE_KEY],
    [SUMMARY_PROMPT_CACHE_KEY]: settingsStore[SUMMARY_PROMPT_CACHE_KEY],
  }),
  save: async (data: BannerOptionsForm) => {
    settingsStore[REPLY_CACHE_KEY] = data[REPLY_CACHE_KEY];
    settingsStore[SUMMARY_PROMPT_CACHE_KEY] = data[SUMMARY_PROMPT_CACHE_KEY];
    await settingsStore.save();
  },
});
</script>

<template>
  <SettingsForm
    v-model:form="formData"
    :loading="loading"
    :error="error"
    :submitForm="saveForm"
    allowReset
  >
    <template #form>
      <text-area class="prompt" v-model="formData[REPLY_CACHE_KEY]" name="reply prompt" rows="5">
        Reply Prompt
      </text-area>
      <text-area
        class="prompt"
        v-model="formData[SUMMARY_PROMPT_CACHE_KEY]"
        name="summary prompt"
        rows="15"
      >
        Summary Prompt
      </text-area>
    </template>
  </SettingsForm>
</template>

<style scoped>
.prompt {
  box-sizing: border-box;
}
.prompt :deep(textarea) {
  font-size: 1rem !important;
  padding-left: 1rem !important;
  padding-right: 1rem !important;
  outline: 1px solid #aaa;
  width: calc(100% - 4px) !important;
  margin-left: 2px;
}
</style>
