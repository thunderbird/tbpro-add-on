import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import useSharingStore from '@send-frontend/apps/send/stores/sharing-store';
import {
  ALL_UPLOADS_ABORTED,
  ALL_UPLOADS_COMPLETE,
} from '@send-frontend/lib/const';
import { organizeFiles } from '@send-frontend/lib/folderView';
import useApiStore from '@send-frontend/stores/api-store';
import useKeychainStore from '@send-frontend/stores/keychain-store';
import { Item } from '@send-frontend/types';
import { ref } from 'vue';

interface FileItem {
  id: number;
  name: string;
  data: File;
}

interface UploadResult extends Item {
  originalId?: number;
}

type StatusUpdateCallback = (
  fileIndex: number,
  status: 'pending' | 'uploading' | 'completed' | 'error'
) => void;

export function useUploadAndShare() {
  const folderStore = useFolderStore();
  const sharingStore = useSharingStore();
  const { api } = useApiStore();
  const { keychain } = useKeychainStore();

  const isUploading = ref(false);
  const isError = ref(false);
  const uploadMap = ref<Map<number, boolean>>(new Map());

  async function uploadAndShare(
    files: FileItem[],
    password: string,
    expiration?: string,
    onStatusUpdate?: StatusUpdateCallback
  ): Promise<void> {
    // Defensive guard: never upload bytes while the keychain is locked (e.g.
    // the passphrase was reset on another client). Sharing would fail later
    // anyway, but only after the file bytes had already been uploaded.
    if (keychain.locked) {
      isError.value = true;
      throw new Error(
        'Cannot upload: encryption keys are locked. Please re-enter your passphrase.'
      );
    }
    isUploading.value = true;
    isError.value = false;
    const uploadedItems: UploadResult[] = [];

    const rootFolderId = await folderStore.getDefaultFolderId();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        // Update status to uploading
        if (onStatusUpdate) {
          onStatusUpdate(i, 'uploading');
        }

        // Note: folderStore.uploadItem returns an Array
        const itemObjArray = await folderStore.uploadItem(
          file.data,
          rootFolderId,
          api
        );

        if (!itemObjArray || itemObjArray?.length === 0) {
          throw new Error(`Could not upload file ${file.name}`);
        }

        console.log(`[uploadAndShare] Successfully uploaded ${file.name}`);

        // We don't want nested arrays, we want a flat array of Items.
        //
        // In case itemObjArray has multiple items (because of multi part
        // uploads), we add each to the `uploadedItems` array.
        //
        // And we stamp each of these with the original file.id.
        // This will be reported back to `background.js` so that it can
        // mark it as complete.
        for (const itemObj of itemObjArray) {
          uploadedItems.push({
            originalId: file.id,
            ...itemObj,
          });
          uploadMap.value.set(file.id, true);
        }

        // Update status to completed
        if (onStatusUpdate) {
          onStatusUpdate(i, 'completed');
        }
      } catch (err) {
        console.log(err);
        if (onStatusUpdate) {
          onStatusUpdate(i, 'error');
        }
        uploadAborted();
        isError.value = true;
        isUploading.value = false;
        throw err;
      }
    }

    try {
      // We make sure that multifile uploads are organized so we can share them
      const organizedFiles = organizeFiles(uploadedItems);
      const url = await sharingStore.shareItems(
        organizedFiles,
        password,
        expiration
      );
      if (!url) {
        throw new Error(`Did not get URL back from sharingStore`);
      }
      console.log(`I got a sharing url and it is`);
      console.log(url);
      shareComplete(url, [...uploadedItems]);
    } catch (err) {
      console.log(err.message);
      shareAborted();
      isError.value = true;
      isUploading.value = false;
      throw err;
    }
  }

  function shareComplete(url: string, results: UploadResult[]) {
    browser.runtime.sendMessage({
      type: ALL_UPLOADS_COMPLETE,
      url,
      results,
      aborted: false,
    });

    window.close();
  }

  function uploadAborted() {
    browser.runtime.sendMessage({
      type: ALL_UPLOADS_ABORTED,
      aborted: true,
    });
  }

  function shareAborted() {
    browser.runtime.sendMessage({
      type: ALL_UPLOADS_ABORTED,
      aborted: true,
    });
    window.close();
  }

  return {
    isUploading,
    isError,
    uploadMap,
    uploadAndShare,
  };
}
