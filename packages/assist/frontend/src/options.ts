import './assets/main.css';

import { createApp, watch } from 'vue';
import { createPinia } from 'pinia';

import OptionsPage from './OptionsPage.vue';
import router from './options-router';
import { useSettingsStore } from '@/stores/settings-store';

const app = createApp(OptionsPage);

app.use(createPinia());
app.use(router);

const settings = useSettingsStore();
async function main() {
  await settings.load();
  app.mount('#app');
  watch(
    () => settings.$state,
    () => {
      settings.save();
    },
    { deep: true }
  );
}

main();

// Inside of Thunderbird, the default route is `/options.html`.
// We want to start at the "root" of the router.
router.replace('/');
