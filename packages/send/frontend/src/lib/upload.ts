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
  generateFileHash,
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
    let completedParts = 0;

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
          setProgress: (partProgress: number) => {
            if (!isMultipart || blobs.length === 1) {
              // For single file uploads, use the part progress directly
              mainTracker.setProgress(Math.min(partProgress, originalFileSize));
            } else {
              // Calculate overall progress based on original file size:
              // (completed_parts / total_parts) * original_size + (current_part_progress / current_part_size) * (original_size / total_parts)
              const completedProgress =
                (completedParts / blobs.length) * originalFileSize;
              const currentPartRatio = Math.min(partProgress / partSize, 1); // Ensure we don't exceed 100%
              const currentPartProgress =
                currentPartRatio * (originalFileSize / blobs.length);
              const overallProgress = completedProgress + currentPartProgress;

              mainTracker.setProgress(
                Math.min(overallProgress, originalFileSize)
              );
            }
          },
        };
      },
      markPartComplete: (partIndex: number) => {
        completedParts = partIndex + 1;
        // Set progress to reflect completed parts based on original file size
        const progress = (completedParts / blobs.length) * originalFileSize;
        mainTracker.setProgress(progress);
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

    // generate a hash from the file
    const fileHash = await generateFileHash(fileBlob);
    console.log('File hash (SHA-256):', fileHash);

    // check fileHash against suspicious files
    const { isSuspicious } = await this.api.call<{ isSuspicious: boolean }>(
      `uploads/check-upload-hash/${fileHash}`
    );

    if (isSuspicious) {
      alert(
        'Warning: This file has been reported as suspicious. You cannot upload it. If you believe this is an error, please contact support.'
      );
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

    let blobs: NamedBlob[] = [];

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

    const uploadResponses: Item[] = [];

    // Process uploads sequentially to maintain proper progress tracking
    for (let index = 0; index < blobs.length; index++) {
      const blob = blobs[index];
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
              fileHash,
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

      uploadResponses.push(item);

      // Mark this part as complete for progress tracking
      multipartTracker.markPartComplete(index);
    }

    return uploadResponses;
  }
}
