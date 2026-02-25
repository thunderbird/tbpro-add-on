import {
  Item,
  ItemResponse,
  UploadResponse,
} from '@send-frontend/apps/send/stores/folder-store.types';
import type { ProcessStage } from '@send-frontend/apps/send/stores/status-store';
import { ProgressTracker } from '@send-frontend/apps/send/stores/status-store';
import { ApiConnection } from '@send-frontend/lib/api';
import { NamedBlob, sendBlob } from '@send-frontend/lib/filesync';
import { Keychain } from '@send-frontend/lib/keychain';
import { UserType } from '@send-frontend/types';
import { SPLIT_SIZE } from './const';
import {
  hashFiles,
  retryUntilSuccessOrTimeout,
  splitIntoMultipleZips,
} from './utils';

export default class Uploader {
  user: UserType;
  keychain: Keychain;
  api: ApiConnection;
  constructor(user: UserType, keychain: Keychain, api: ApiConnection) {
    this.user = user;
    // Even though we only need the user.id, we must receive the entire,
    // reactive `user` object. This gives enough time for it to "hydrate"
    // from an existing session or to populate from an initial login.
    this.keychain = keychain;
    this.api = api;
  }

  /**
   * Creates a multipart progress tracker that manages overall progress across all parts
   */
  private createMultipartProgressTracker(
    mainTracker: ProgressTracker,
    blobs: NamedBlob[],
    isMultipart: boolean,
    originalFileSize: number
  ) {
    const blobSizes = blobs.map((blob) => blob.size);
    const totalBlobSize = blobSizes.reduce((sum, size) => sum + size, 0);
    // Track progress for each part individually to handle concurrent uploads
    const partProgress = new Array(blobs.length).fill(0);

    const updateOverallProgress = () => {
      if (!isMultipart || blobs.length === 1) {
        // For single file uploads, use the part progress directly
        mainTracker.setProgress(Math.min(partProgress[0], originalFileSize));
      } else {
        // Calculate overall progress by summing all parts' progress
        // and scaling to the original file size
        const totalProgress = partProgress.reduce(
          (sum, progress) => sum + progress,
          0
        );
        const overallProgress =
          (totalProgress / totalBlobSize) * originalFileSize;
        mainTracker.setProgress(Math.min(overallProgress, originalFileSize));
      }
    };

    return {
      getPartTracker: (partIndex: number) => {
        const partSize = blobSizes[partIndex];

        return {
          total: mainTracker.total,
          progressed: mainTracker.progressed,
          percentage: mainTracker.percentage,
          error: mainTracker.error,
          text: mainTracker.text,
          fileName: mainTracker.fileName,
          processStage: mainTracker.processStage,
          initialize: () => {
            // Don't reinitialize the main tracker for each part
          },
          setUploadSize: () => {
            // Already set on the main tracker
          },
          setFileName: (name: string) => {
            mainTracker.setFileName(name);
          },
          setProcessStage: (stage: ProcessStage) => {
            mainTracker.setProcessStage(stage);
          },
          setText: (message: string) => {
            if (isMultipart && blobs.length > 1) {
              mainTracker.setText(message);
            } else {
              mainTracker.setText(message);
            }
          },
          setProgress: (progress: number) => {
            // Update this part's progress
            partProgress[partIndex] = Math.min(progress, partSize);
            // Recalculate overall progress based on all parts
            updateOverallProgress();
          },
        };
      },
      markPartComplete: (partIndex: number) => {
        // Mark this part as fully complete
        partProgress[partIndex] = blobSizes[partIndex];
        updateOverallProgress();
      },
    };
  }

  async doUpload(
    fileBlob: NamedBlob,
    containerId: string,
    api: ApiConnection,
    progressTracker: ProgressTracker
  ): Promise<Item[]> {
    if (!containerId) {
      return null;
    }

    if (!fileBlob) {
      return null;
    }

    // get folder key
    const wrappingKey = await this.keychain.get(containerId);
    if (!wrappingKey) {
      return null;
    }

    // generate new AES key for the uploaded Content
    const key = await this.keychain.content.generateKey();

    // wrap the key for inclusion with the Item
    const wrappedKeyStr = await this.keychain.container.wrapContentKey(
      key,
      wrappingKey
    );

    let blobs: NamedBlob[];

    const hashes = await hashFiles(api, fileBlob, SPLIT_SIZE);

    const shouldSplit = fileBlob.size > SPLIT_SIZE;
    if (shouldSplit) {
      const zips = await splitIntoMultipleZips(fileBlob, SPLIT_SIZE);
      blobs = zips || []; // Ensure blobs is never undefined
    } else {
      blobs = [fileBlob];
    }

    // Ensure we have valid blobs before proceeding
    if (!blobs || blobs.length === 0) {
      return null;
    }

    // Initialize progress tracking for multipart uploads - don't call initialize() as it resets fileName
    progressTracker.setUploadSize(fileBlob.size); // Use original file size for progress tracking
    progressTracker.setProcessStage('preparing');
    progressTracker.setText('Preparing file for upload');

    // Create a multipart progress tracker that manages overall progress
    const multipartTracker = this.createMultipartProgressTracker(
      progressTracker,
      blobs,
      shouldSplit,
      fileBlob.size // Pass original file size
    );

    // Process all uploads concurrently for better performance
    const uploadPart = async (
      blob: NamedBlob,
      index: number
    ): Promise<Item | null> => {
      const filename = blob.name;
      const isBucketStorage = api.isBucketStorage;

      const partTracker = multipartTracker.getPartTracker(index);

      // Retry the entire upload block if either the upload POST or itemObj call fail
      let uploadResult: {
        upload: UploadResponse;
        itemObj: ItemResponse;
      } | null = null;
      let retryCount = 0;
      const maxRetries = 3;

      // We set the part number starting from 1 to avoid problems with part 0 evaluating to false
      const part = shouldSplit ? index + 1 : undefined;

      while (retryCount < maxRetries && !uploadResult) {
        try {
          // Blob is encrypted as it is uploaded through a websocket connection
          const id = await sendBlob(
            blob,
            key,
            api,
            partTracker,
            isBucketStorage
          );

          if (!id) {
            throw new Error('Failed to send blob');
          }

          if (!isBucketStorage) {
            // Poll the api to check if the file is in storage
            await retryUntilSuccessOrTimeout(async () => {
              const { size } = await this.api.call<{ size: null | number }>(
                `uploads/${id}/stat`
              );
              // Return a boolean, telling us if the size is null or not
              return !!size;
            });
          }

          // Create a Content entry in the database
          const result = await this.api.call<{
            upload: UploadResponse;
          }>(
            'uploads',
            {
              id: id,
              size: blob.size,
              ownerId: this.user.id,
              type: blob.type,
              containerId,
              part, // if the file was split into multiple zips, we add the part
              fileHash: hashes[index],
            },
            'POST'
          );
          if (!result) {
            throw new Error('Failed to create upload entry');
          }
          const upload = result.upload;

          // For the Content entry, create the corresponding Item in the Container
          const itemObj = await this.api.call<ItemResponse>(
            `containers/${containerId}/item`,
            {
              uploadId: upload.id,
              name: filename,
              type: 'MESSAGE',
              wrappedKey: wrappedKeyStr,
              multipart: shouldSplit ? true : false,
              totalSize: fileBlob.size,
            },
            'POST'
          );

          if (!itemObj) {
            throw new Error('Failed to create item object');
          }

          uploadResult = { upload, itemObj };
        } catch (error) {
          retryCount++;
          console.error(`Upload attempt ${retryCount} failed:`, error);

          if (retryCount >= maxRetries) {
            console.error(`Upload failed after ${maxRetries} attempts`);
            return null;
          }

          // Wait before retrying (exponential backoff)
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, retryCount) * 1000)
          );
        }
      }

      if (!uploadResult) {
        return null;
      }

      const { itemObj } = uploadResult;

      const item: Item = {
        ...itemObj,
        upload: {
          size: blob.size,
          type: blob.type,
          part,
        },
      };

      // Mark this part as complete for progress tracking
      multipartTracker.markPartComplete(index);

      return item;
    };

    // Process uploads in batches of 5 for better resource management
    const uploadResponses: Item[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < blobs.length; i += BATCH_SIZE) {
      const batch = blobs.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map((blob, batchIndex) => {
        const index = i + batchIndex;
        return uploadPart(blob, index);
      });

      const batchResults = await Promise.all(batchPromises);

      // Check if any uploads in this batch failed
      if (batchResults.some((response) => response === null)) {
        return null;
      }

      uploadResponses.push(...batchResults);
    }

    return uploadResponses;
  }
}
