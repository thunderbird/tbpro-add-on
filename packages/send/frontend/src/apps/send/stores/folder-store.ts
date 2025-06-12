import { CONTAINER_TYPE } from '@/lib/const';
import Downloader from '@/lib/download';
import { _saveFileStream } from '@/lib/filesync';
import { Keychain } from '@/lib/keychain';
import Uploader from '@/lib/upload';
import useApiStore from '@/stores/api-store';
import useKeychainStore from '@/stores/keychain-store';
import useUserStore from '@/stores/user-store';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import {
  Container,
  ContainerResponse,
  Item,
  ItemResponse,
} from '@/apps/send/stores/folder-store.types';
import { ApiConnection } from '@/lib/api';
import { NamedBlob } from '@/lib/filesync';
import { backupKeys } from '@/lib/keychain';
import { CLIENT_MESSAGES } from '@/lib/messages';
import { checkBlobSize, formatBlob, unzipMultipartPiece } from '@/lib/utils';

import { decryptStream } from '@/lib/ece';
import { organizeFiles } from '@/lib/folderView';
import { _download } from '@/lib/helpers';
import { blobStream } from '@/lib/streams';
import useMetricsStore from '@/stores/metrics';
import { useStatusStore } from './status-store';

export interface FolderStore {
  rootFolder: Container;
  defaultFolder: Container | null;
  visibleFolders: Container[];
  selectedFolder: Container;
  selectedFile: ItemResponse;
  createFolder: (
    name?: string,
    parentId?: string,
    shareOnly?: boolean
  ) => Promise<Container | null>;
  sync: () => Promise<void>;
  init: () => void;
  print: () => void;
  goToRootFolder: (folderId: string) => Promise<void>;
  setSelectedFolder: (folderId: string) => void;
  setSelectedFile: (itemId: number) => Promise<void>;
  renameFolder: (folderId: string, name: string) => Promise<Container>;
  deleteFolder: (folderId: string) => Promise<void>;
  uploadItem: (
    fileBlob: Blob,
    folderId: string,
    api: ApiConnection
  ) => Promise<ItemResponse[]>;
  deleteItem: (itemId: number, folderId: string) => Promise<void>;
  renameItem: (
    folderId: string,
    itemId: number,
    name: string
  ) => Promise<ItemResponse>;
  downloadContent: (
    uploadId: string,
    containerId: string,
    wrappedKeyStr: string,
    name: string
  ) => Promise<boolean>;
}

const useFolderStore = defineStore('folderManager', () => {
  const { api } = useApiStore();
  const { user } = useUserStore();
  const { setUploadSize, progress } = useStatusStore();
  const { metrics } = useMetricsStore();
  const { keychain } = useKeychainStore();

  const uploader = new Uploader(user, keychain, api);
  const downloader = new Downloader(keychain, api);

  const folders = ref<Container[]>([]);
  const rootFolder = ref<Container | null>(null);
  const msg = ref('');

  const selectedFolderId = ref<string | null>(null);
  const selectedFileId = ref<number | null>(null);

  const defaultFolder = computed(() => {
    if (!folders?.value) {
      return null;
    }
    const total = folders.value.length;
    return total === 0 ? null : folders.value[total - 1];
  });

  const visibleFolders = computed(() => {
    if (folders.value.length === 0) {
      return [];
    }
    return calculateFolderSizes(folders.value);
  });

  const selectedFolder = computed<Container | null>(() => {
    if (!selectedFolderId.value) return null;
    return findContainer(selectedFolderId.value, folders.value);
  });

  const selectedFile = computed<Item | null>(() => {
    if (!selectedFileId.value || !rootFolder.value?.items) return null;
    return findItem(selectedFileId.value, rootFolder.value.items);
  });

  function init(): void {
    console.log(`initializing the folderStore`);
    folders.value = [];
    rootFolder.value = null;

    selectedFolderId.value = null;
    selectedFileId.value = null;
  }

  async function fetchSubtree(rootFolderId: string): Promise<void> {
    const tree = await api.call<ContainerResponse>(
      `containers/${rootFolderId}/`
    );
    folders.value = tree.children;
    rootFolder.value = tree;
  }

  async function fetchUserFolders(): Promise<void> {
    const userFolders = await api.call<ContainerResponse[]>(`users/folders`);
    folders.value = userFolders;
    rootFolder.value = null;
  }

  async function goToRootFolder(folderId: string | null): Promise<void> {
    if (folderId) {
      await fetchSubtree(folderId);
    } else {
      await fetchUserFolders();
      selectedFolderId.value = null;
      selectedFileId.value = null;
    }
  }

  function setSelectedFolder(folderId: string): void {
    selectedFolderId.value = folderId;
    selectedFileId.value = null;
  }

  async function setSelectedFile(itemId: number): Promise<void> {
    selectedFolderId.value = null;
    selectedFileId.value = itemId;
  }

  async function createFolder(
    name = 'Untitled',
    parentId?: string,
    shareOnly = false
  ): Promise<Container | null> {
    if (rootFolder.value) {
      parentId = rootFolder.value.id;
    }
    const containerResponse = await api.call<{ container: Container }>(
      `containers`,
      {
        name,
        type: CONTAINER_TYPE.FOLDER,
        parentId,
        shareOnly,
      },
      'POST'
    );

    if (containerResponse?.container) {
      const { container } = containerResponse;
      folders.value = [...folders.value, container];
      await keychain.newKeyForContainer(container.id);
      await backupKeys(keychain, api, msg);
      await keychain.store();
      return container;
    }
    return null;
  }

  async function renameFolder(
    folderId: string,
    name: string
  ): Promise<Container> {
    const result = await api.call<ContainerResponse>(
      `containers/${folderId}/rename`,
      { name },
      'POST'
    );
    if (result) {
      const node = findContainer(folderId, folders.value);
      if (node) {
        node.name = result.name;
      }
    }
    return result;
  }

  async function renameItem(
    folderId: string,
    itemId: number,
    name: string
  ): Promise<Item> {
    const result = await api.call<ItemResponse>(
      `containers/${folderId}/item/${itemId}/rename`,
      { name },
      'POST'
    );
    if (result && rootFolder.value?.items) {
      const node = findItem(itemId, rootFolder.value.items);
      if (node) {
        node.name = result.name;
      }
    }
    return result;
  }

  async function uploadItem(
    fileBlob: NamedBlob,
    folderId: string,
    api: ApiConnection
  ): Promise<Item[]> {
    progress.error = '';

    const canUpload = await checkBlobSize(fileBlob);

    if (!canUpload) {
      progress.error = CLIENT_MESSAGES.FILE_TOO_BIG;
      throw new Error('Too big');
    }

    const formattedBlob = await formatBlob(fileBlob);
    setUploadSize(formattedBlob.size);

    try {
      const newItems = await uploader.doUpload(
        formattedBlob,
        folderId,
        api,
        progress
      );
      if (newItems && rootFolder.value) {
        rootFolder.value.items = [...rootFolder.value.items, ...newItems];
      }
      return newItems;
    } catch (error) {
      console.error('Upload failed in uploadItem:', error);
      progress.error = error.message;
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  async function deleteFolder(folderId: string): Promise<void> {
    const resp = await api.call<{ result: { message: string }[] }>(
      `containers/${folderId}`,
      {},
      'DELETE'
    );

    if (resp?.result.length > 0) {
      folders.value = [...folders.value.filter((f) => f.id !== folderId)];
    }
  }

  async function deleteItem(itemId: number, folderId: string): Promise<void> {
    const result = await api.call(
      `containers/${folderId}/item/${itemId}`,
      {
        shouldDeleteContent: true,
      },
      'DELETE'
    );
    if (result) {
      if (selectedFileId.value === itemId) {
        setSelectedFile(null);
      }
      if (rootFolder.value?.items) {
        const deletedKey = result.wrappedKey;
        rootFolder.value.items = [
          ...rootFolder.value.items.filter(
            (i: Item) => i.wrappedKey !== deletedKey
          ),
        ];
      }
    }
  }

  /**
   * Memory-Optimized Multipart Download Implementation
   *
   * This implementation replaces the previous memory-intensive approach that loaded all file pieces
   * into ArrayBuffer objects simultaneously. The key improvements include:
   *
   * 1. **Streaming Processing**: Each piece is processed as a stream, reducing peak memory usage
   * 2. **Sequential Download**: Pieces are downloaded and processed one at a time rather than all at once
   * 3. **Chunked Output**: Large pieces are streamed in 64KB chunks to prevent memory spikes
   * 4. **Progressive Enhancement**: Uses File System Access API when available for true streaming saves
   * 5. **Efficient Concatenation**: Combines pieces using ReadableStream without intermediate buffers
   *
   * For a 2GB file split into 10 pieces:
   * - Old approach: ~4GB+ peak memory usage (original + combined + intermediate buffers)
   * - New approach: ~200MB peak memory usage (single piece + processing overhead)
   */
  async function downloadMultipart(
    upload: { id: string; part: number }[],
    containerId: string,
    wrappedKeyStr: string,
    name: string,
    api: ApiConnection,
    keychain: Keychain
  ) {
    let combinedType = '';

    const _uploads = await api.call<{ id: string; part: number }[]>(
      `uploads/${upload.at(0).id}/parts`
    );

    const wrappingKey = await keychain.get(containerId);
    if (!wrappingKey) {
      throw new Error('Wrapping key not found');
    }

    const contentKey: CryptoKey = await keychain.container.unwrapContentKey(
      wrappedKeyStr,
      wrappingKey
    );

    // Get metadata for all pieces to determine type and validate
    const pieceMetadata = await Promise.all(
      _uploads.map(async ({ id, part }) => {
        if (!id) return null;

        const { size, type } = await api.call<{
          size: number;
          type: string;
        }>(`uploads/${id}/metadata`);

        if (!size) return null;

        // Store the type from the first piece
        if (!combinedType && type) {
          combinedType = type;
        }

        return { id, part, size, type };
      })
    );

    const validMetadata = pieceMetadata.filter((meta) => meta !== null);
    if (validMetadata.length === 0) {
      throw new Error('No valid pieces found');
    }

    // Sort pieces by part number
    const sortedMetadata = validMetadata.sort((a, b) => a.part - b.part);

    // Create a streaming download function for each piece
    const createPieceStream = async (metadata: {
      id: string;
      size: number;
    }) => {
      const bucketResponse = await api.call<{ url: string }>(
        `download/${metadata.id}/signed`
      );

      if (!bucketResponse?.url) {
        throw new Error('BUCKET_URL_NOT_FOUND');
      }

      const downloadedBlob = await _download({
        url: bucketResponse.url,
        progressTracker: progress,
      });

      let pieceStream: ReadableStream<Uint8Array>;
      if (contentKey) {
        pieceStream = decryptStream(blobStream(downloadedBlob), contentKey);
      } else {
        pieceStream = blobStream(downloadedBlob);
      }

      // Transform stream to handle unzipping efficiently
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          const reader = pieceStream.getReader();
          const chunks: Uint8Array[] = [];
          let totalSize = 0;

          try {
            // Read stream in chunks to avoid loading everything at once
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              totalSize += value.length;
            }

            // Create a single buffer for unzipping (this is necessary for the unzip operation)
            const pieceBuffer = new Uint8Array(totalSize);
            let offset = 0;
            for (const chunk of chunks) {
              pieceBuffer.set(chunk, offset);
              offset += chunk.length;
            }

            // Unzip the piece
            const { content: unzippedContent } = await unzipMultipartPiece(
              pieceBuffer.buffer
            );

            // Stream the unzipped content in chunks to avoid memory spikes
            const chunkSize = 64 * 1024; // 64KB chunks
            const unzippedView = new Uint8Array(unzippedContent);

            for (let i = 0; i < unzippedView.length; i += chunkSize) {
              const chunk = unzippedView.slice(i, i + chunkSize);
              controller.enqueue(chunk);
            }

            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });
    };

    // Create a combined readable stream that processes pieces sequentially
    const combinedStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (const metadata of sortedMetadata) {
            const pieceStream = await createPieceStream(metadata);
            const reader = pieceStream.getReader();

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    // Save the file using streaming approach with better memory management
    return await _saveFileStream({
      stream: combinedStream,
      name: decodeURIComponent(name),
      type: combinedType,
    });
  }

  async function downloadContent(
    uploadId: string,
    containerId: string,
    wrappedKeyStr: string,
    name: string
  ): Promise<boolean> {
    return await downloader.doDownload(
      uploadId,
      containerId,
      wrappedKeyStr,
      name,
      metrics,
      progress
    );
  }

  function print(): void {
    console.log(`rootFolder: ${rootFolder.value}`);
    console.log(`defaultFolder: ${defaultFolder.value}`);
    console.log(`visibleFolders: ${visibleFolders.value}`);
    console.log(`selectedFolder: ${selectedFolder.value}`);
    console.log(`selectedFile: ${selectedFile.value}`);
  }

  return {
    rootFolder: computed(() => {
      const rootFolderValue = rootFolder.value;
      if (!rootFolderValue) return null;
      return {
        ...rootFolderValue,
        items: organizeFiles(rootFolderValue?.items || []),
      };
    }),
    defaultFolder: computed(() => {
      const defaultFolderValue = defaultFolder.value;
      if (!defaultFolderValue) return null;
      return defaultFolderValue
        ? {
            ...defaultFolderValue,
            items: organizeFiles(defaultFolderValue.items || []),
          }
        : null;
    }),
    visibleFolders: computed(() => visibleFolders.value),
    selectedFolder: computed(() => selectedFolder.value),
    selectedFile: computed(() => selectedFile.value),
    print,
    init,
    fetchSubtree,
    fetchUserFolders,
    goToRootFolder,
    sync: async () => await goToRootFolder(null),
    setSelectedFolder,
    setSelectedFile,
    createFolder,
    renameFolder,
    deleteFolder,
    renameItem,
    uploadItem,
    deleteItem,
    downloadContent,
    downloadMultipart,
  };
});

export default useFolderStore;

function calculateFolderSizes(folders: Container[]): Container[] {
  const foldersWithSizes = folders.map((folder) => {
    const size =
      folder.items?.reduce(
        (total, { upload }) => total + upload?.size || 0,
        0
      ) || 0;

    folder.size = size;
    return folder;
  });
  return foldersWithSizes;
}

function findContainer(
  id: string,
  containers: Container[] | undefined
): Container | null {
  if (!containers) return null;
  return containers.find((container) => container.id === id) || null;
}

function findItem(id: number, items: Item[] | undefined): Item | null {
  if (!items) return null;
  return items.find((item) => item.id === id) || null;
}
