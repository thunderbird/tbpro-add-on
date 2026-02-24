import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useBackupStore = defineStore('backup', () => {
  const backupCompleted = ref(false);
  const words = ref<string[]>([]);
  const errorMessage = ref('');
  const shouldUnlock = ref(false);
  const shouldReset = ref(false);

  const passphraseString = computed(() => {
    return words.value.join(' ');
  });

  function setBackupCompleted(completed: boolean) {
    backupCompleted.value = completed;
  }

  function setWords(newWords: string[]) {
    words.value = newWords;
  }

  function setErrorMessage(message: string) {
    errorMessage.value = message;
  }

  function setShouldUnlock(value: boolean) {
    shouldUnlock.value = value;
  }

  function setShouldReset(value: boolean) {
    shouldReset.value = value;
  }

  function resetBackupState() {
    backupCompleted.value = false;
    words.value = [];
    errorMessage.value = '';
    shouldUnlock.value = false;
    shouldReset.value = false;
  }

  return {
    backupCompleted,
    words,
    errorMessage,
    shouldUnlock,
    shouldReset,
    passphraseString,
    setBackupCompleted,
    setWords,
    setErrorMessage,
    setShouldUnlock,
    setShouldReset,
    resetBackupState,
  };
});

export default useBackupStore;
