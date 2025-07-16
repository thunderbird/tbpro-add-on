import { useConfigStore } from '@send-frontend/apps/send/stores/config-store';
import { ApiConnection } from '@send-frontend/lib/api';
import { defineStore } from 'pinia';

const useApiStore = defineStore('api', () => {
  const configurationStore = useConfigStore();
  const url = configurationStore.serverUrl;
  const api = new ApiConnection(url);
  return {
    api,
  };
});

export default useApiStore;
