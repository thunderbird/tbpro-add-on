import { FILE_LIST, POPUP_READY, SIGN_OUT } from '@send-frontend/lib/const';
import { ref } from 'vue';

export interface FileItem {
  id: number;
  name: string;
  data: File;
}

// The upload window's side of the handshake with background.ts: ask for the
// attached files with POPUP_READY and keep what comes back in FILE_LIST.
export function usePopupFileList() {
  const files = ref<FileItem[] | null>(null);
  let isListening = false;

  // Only the first call does anything, so it is safe to call on every refetch.
  // background.ts empties its queue once it has answered POPUP_READY, so asking
  // again would get back an empty FILE_LIST that wipes the files this window is
  // about to upload. Throws when browser.runtime is unavailable (not running as
  // an extension); a later call then tries again.
  function requestFiles() {
    if (isListening) {
      return;
    }
    console.log(`adding listener in Popup for runtime messages`);

    browser.runtime.onMessage.addListener(async (message) => {
      if (message.type === FILE_LIST) {
        files.value = message.files;
      } else if (message.type === SIGN_OUT) {
        // Session ended -- clear any pending uploads and let the
        // logged-out UI render via the isLoggedIn watcher. The popup
        // may also be closed by background.ts in the same SIGN_OUT
        // handling, but doing this here is defensive in case the popup
        // survives (e.g. a web-tab sign-out that didn't close us).
        // See https://github.com/thunderbird/tbpro-add-on/issues/1019.
        files.value = [];
      }
    });
    isListening = true;

    browser.runtime.sendMessage({
      type: POPUP_READY,
    });
  }

  return { files, requestFiles };
}
