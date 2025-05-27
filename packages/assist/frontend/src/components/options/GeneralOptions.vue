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
    const stored = settingsStore[ENABLED_ACCOUNTS_CACHE_KEY];
    let initial = stored.length > 0 ? stored : [];
    // if no stored accounts, pick the default account
    if (initial.length === 0) {
      const def = await messenger.accounts.getDefault();
      if (def) initial = [def.id];
    }
    return {
      [REMOTE_HANDOFF_CACHE_KEY]: settingsStore[REMOTE_HANDOFF_CACHE_KEY],
      [ENCRYPTED_SUMMARY_CACHE_KEY]: settingsStore[ENCRYPTED_SUMMARY_CACHE_KEY],
      [ENABLED_ACCOUNTS_CACHE_KEY]: initial,
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

      <!-- checkbox list for selecting accounts -->
      <fieldset class="mt-4">
        <legend class="font-medium mb-2">Select Accounts</legend>
        <div v-for="acc in accounts" :key="acc.id" class="flex items-center mb-1">
          <input
            type="checkbox"
            :id="`acc-${acc.id}`"
            :value="acc.id"
            v-model="formData[ENABLED_ACCOUNTS_CACHE_KEY]"
            class="mr-2"
          />
          <label :for="`acc-${acc.id}`">{{ acc.name }}</label>
        </div>
      </fieldset>
    </template>
  </SettingsForm>
</template>
