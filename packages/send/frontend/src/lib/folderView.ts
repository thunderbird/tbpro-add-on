import { Item } from '@/types';
import { ApiConnection } from './api';
import { Keychain } from './keychain';

/**
 * This function is meant for managing files in a folder, handling multipart file deduplication
 * @returns Computed property containing unique files with multipart suffix removed
 */
export const organizeFiles = (files: Item[]) => {
  const items: Item[] = [];

  if (!files) {
    return [];
  }

  files.forEach((item) => {
    // When items are not multipart, we can directly add them to the list
    if (!item.multipart) {
      items.push(item);
      return;
    }
    // For multipart items, we only show the first item but we show the item size
    if (item.upload.part === 1) {
      items.push({ ...item, upload: { ...item.upload, size: item.totalSize } });
    }
  });
  return items;
};

export const computeMultipartFile = (wrappedKey: string, items: Item[]) => {
  const selectedFileWrappedKey = wrappedKey;
  return items
    .filter(({ wrappedKey }) => wrappedKey === selectedFileWrappedKey)
    .map((item) => ({
      id: item.upload.id,
      part: item.upload.part,
      item,
    }));
};

type MultipartItems = {
  id: string;
  part: number;
  item: Item;
};

export async function handleMultipartDownload(
  multipartItems: MultipartItems[],
  item: Item,
  downloadCallback: (
    multipartItems: { id: string; part: number }[],
    containerId: string,
    wrappedKey: string,
    name: string,
    api: ApiConnection,
    keychain: Keychain
  ) => Promise<void>,
  api: ApiConnection,
  keychain: Keychain
) {
  await downloadCallback(
    multipartItems.map(({ id, part }) => ({ id, part })),
    item.containerId,
    item.wrappedKey,
    item.name,
    api,
    keychain
  );
  return true;
}
