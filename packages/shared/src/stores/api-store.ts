import { ApiConnection } from '@shared/lib/api';
import { defineStore } from 'pinia';
import { useConfigStore } from './config-store';

const useApiStore = defineStore('api', () => {
  const configurationStore = useConfigStore();
  const url = configurationStore.serverUrl;
  const api = new ApiConnection(url);
  return {
    api,
  };
});

export default useApiStore;
