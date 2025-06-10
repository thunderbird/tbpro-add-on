<script setup lang="ts">
import { SwitchToggle } from '@thunderbirdops/services-ui';
import { ref, onMounted } from 'vue';
import { configureFormStorage } from '@/composables/configureFormStorage';
import { useSettingsStore } from '@/stores/settings-store';
import SettingsForm from '@/components/options/SettingsForm.vue';
import {
  ENABLED_ACCOUNTS_CACHE_KEY,
  ENCRYPTED_SUMMARY_CACHE_KEY,
  REMOTE_HANDOFF_CACHE_KEY,
} from '@/const';

type AccountOption = { id: string; name: string };
type GeneralSettingsForm = {
  [REMOTE_HANDOFF_CACHE_KEY]: boolean;
  [ENCRYPTED_SUMMARY_CACHE_KEY]: boolean;
  [ENABLED_ACCOUNTS_CACHE_KEY]: string[];
};

const settingsStore = useSettingsStore();

const accounts = ref<AccountOption[]>([]);
onMounted(async () => {
  const accs = await messenger.accounts.list();
  accounts.value = accs.map((a) => ({
    id: a.id,
    name: a.name || `Account ${a.id}`,
  }));
});

const { formData, loading, error, saveForm } = configureFormStorage<GeneralSettingsForm>({
  load: async (): Promise<GeneralSettingsForm> => {
    debugger;
    console.log(settingsStore[ENABLED_ACCOUNTS_CACHE_KEY]);
    return {
      [REMOTE_HANDOFF_CACHE_KEY]: settingsStore[REMOTE_HANDOFF_CACHE_KEY],
      [ENCRYPTED_SUMMARY_CACHE_KEY]: settingsStore[ENCRYPTED_SUMMARY_CACHE_KEY],
      [ENABLED_ACCOUNTS_CACHE_KEY]: settingsStore[ENABLED_ACCOUNTS_CACHE_KEY],
    };
  },
  save: async (data: GeneralSettingsForm) => {
    settingsStore[REMOTE_HANDOFF_CACHE_KEY] = data[REMOTE_HANDOFF_CACHE_KEY];
    settingsStore[ENCRYPTED_SUMMARY_CACHE_KEY] = data[ENCRYPTED_SUMMARY_CACHE_KEY];
    settingsStore[ENABLED_ACCOUNTS_CACHE_KEY] = data[ENABLED_ACCOUNTS_CACHE_KEY];
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
      <switch-toggle
        v-model="formData[ENCRYPTED_SUMMARY_CACHE_KEY]"
        label="Enable AI tools with encrypted emails"
        name="encrypted_emails"
        :noLegend="true"
      />
      <switch-toggle
        v-model="formData[REMOTE_HANDOFF_CACHE_KEY]"
        label="Remote Handoff"
        name="remote_handoff"
        :noLegend="true"
      />

    </template>
  </SettingsForm>
</template>
