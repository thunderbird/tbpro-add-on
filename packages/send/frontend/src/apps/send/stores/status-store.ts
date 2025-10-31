// stores/counter.js
import { validator } from '@send-frontend/lib/validations';
import useApiStore from '@send-frontend/stores/api-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import useUserStore from '@send-frontend/stores/user-store';
import { useDebounceFn } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

// Define the possible process stages
export type ProcessStage =
  | 'idle'
  | 'preparing'
  | 'encrypting'
  | 'uploading'
  | 'downloading'
  | 'decrypting'
  | 'processing'
  | 'completed'
  | 'error';

export const useStatusStore = defineStore('status', () => {
  const { api } = useApiStore();
  const userStore = useUserStore();
  const { keychain } = useKeychainStore();

  // Download status
  const total = ref(0);
  const progressed = ref(0);
  const error = ref<string>('');
  const text = ref<string>('');

  // File metadata
  const fileName = ref<string>('');
  const processStage = ref<ProcessStage>('idle');

  // Router loading state
  const isRouterLoading = ref<boolean>(false);

  const debouncedUpdate = useDebounceFn((updatedValue: number) => {
    progressed.value = updatedValue;
  }, 1);

  function setText(message: string) {
    text.value = message;
  }

  function setUploadSize(size: number) {
    total.value = size;
  }

  function setProgress(number: number) {
    console.log('setting progress', number);
    debouncedUpdate(number);
  }

  function setFileName(name: string) {
    fileName.value = name;
  }

  function setProcessStage(stage: ProcessStage) {
    processStage.value = stage;
  }

  function initialize() {
    total.value = 0;
    progressed.value = 0;
    error.value = '';
    text.value = '';
    fileName.value = '';
    processStage.value = 'idle';
  }

  function setRouterLoading(loading: boolean) {
    isRouterLoading.value = loading;
  }

  const percentage = computed(() => {
    const result = (progressed.value * 100) / total.value;
    if (Number.isNaN(result)) {
      return 0;
    }
    if (result > 100) {
      return 100;
    }
    return Math.round(result);
  });

  const validators = () => validator({ api, keychain, userStore });

  return {
    validators,
    setProgress,
    setUploadSize,
    setText,
    setFileName,
    setProcessStage,
    setRouterLoading,
    isRouterLoading,
    progress: {
      total,
      progressed,
      percentage,
      error,
      text,
      fileName,
      processStage,
      initialize,
      setProgress,
      setUploadSize,
      setText,
      setFileName,
      setProcessStage,
    },
  };
});

export type StatusStore = ReturnType<typeof useStatusStore>;
export type ProgressTracker = StatusStore['progress'];
