import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useBackupStore = defineStore('backup', () => {
  const backupCompleted = ref(false);
  const words = ref<string[]>([]);
  const errorMessage = ref('');
  const shouldUnlock = ref(false);
  const shouldReset = ref(false);
  // Forces the BackupKeys overlay from "Create new encryption key" until the
  // new recovery key is saved or the reset is abandoned (#1116, #1355).
  const justReset = ref(false);
  // The server still holds the old key: "Download and Continue" swaps it in.
  // In-memory on purpose, so leaving before that click changes nothing (#1355).
  const pendingReset = ref(false);
  // "Download and Continue" is running; shared so a remounted dashboard can't
  // start a second swap.
  const savingBackup = ref(false);

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

  function setJustReset(value: boolean) {
    justReset.value = value;
  }

  function setPendingReset(value: boolean) {
    pendingReset.value = value;
  }

  function setSavingBackup(value: boolean) {
    savingBackup.value = value;
  }

  function resetBackupState() {
    backupCompleted.value = false;
    words.value = [];
    errorMessage.value = '';
    shouldUnlock.value = false;
    shouldReset.value = false;
    justReset.value = false;
    pendingReset.value = false;
    savingBackup.value = false;
  }

  return {
    backupCompleted,
    words,
    errorMessage,
    shouldUnlock,
    shouldReset,
    justReset,
    pendingReset,
    savingBackup,
    passphraseString,
    setBackupCompleted,
    setWords,
    setErrorMessage,
    setShouldUnlock,
    setShouldReset,
    setJustReset,
    setPendingReset,
    setSavingBackup,
    resetBackupState,
  };
});

export default useBackupStore;
