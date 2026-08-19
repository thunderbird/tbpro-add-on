import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useBackupStore = defineStore('backup', () => {
  const backupCompleted = ref(false);
  const words = ref<string[]>([]);
  const errorMessage = ref('');
  const shouldUnlock = ref(false);
  const shouldReset = ref(false);
  // True immediately after a "Reset Access → Create new encryption key" swap,
  // until the user saves the freshly generated recovery key via the backup
  // overlay. It forces the BackupKeys overlay to appear even though the account
  // now has a valid server backup (issue #1116: the safe reset installs a new
  // blob, so the old "server has no backup" signal that used to trigger the
  // overlay no longer fires — we drive it explicitly instead).
  const justReset = ref(false);

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

  function resetBackupState() {
    backupCompleted.value = false;
    words.value = [];
    errorMessage.value = '';
    shouldUnlock.value = false;
    shouldReset.value = false;
    justReset.value = false;
  }

  return {
    backupCompleted,
    words,
    errorMessage,
    shouldUnlock,
    shouldReset,
    justReset,
    passphraseString,
    setBackupCompleted,
    setWords,
    setErrorMessage,
    setShouldUnlock,
    setShouldReset,
    setJustReset,
    resetBackupState,
  };
});

export default useBackupStore;
