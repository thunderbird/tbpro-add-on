// stores/settings.ts
import { toRaw } from 'vue';
import { defineStore } from 'pinia';
import { settingsInitialState, settingsStorage } from '@/storage';
import { STORE_NAME_SETTINGS } from '@/const';

export type SettingsState = typeof settingsInitialState;
export type SettingsStore = ReturnType<typeof useSettingsStore>;

export const useSettingsStore = defineStore(STORE_NAME_SETTINGS, {
  state: (): SettingsState => ({ ...settingsInitialState }),
  actions: {
    async load() {
      const saved = await settingsStorage.get();
      this.$patch(saved);
    },
    async save() {
      // Convert from reactive state before storing.
      await settingsStorage.set(toRaw(this.$state));
    },
  },
});
