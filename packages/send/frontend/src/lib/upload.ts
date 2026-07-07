import {
  Item,
  ItemResponse,
  UploadResponse,
} from '@send-frontend/apps/send/stores/folder-store.types';
import type { ProcessStage } from '@send-frontend/apps/send/stores/status-store';
import { ProgressTracker } from '@send-frontend/apps/send/stores/status-store';
import { ApiCallFailure, ApiConnection } from '@send-frontend/lib/api';
import { NamedBlob, sendBlob } from '@send-frontend/lib/filesync';
import { Keychain } from '@send-frontend/lib/keychain';
import { UserType } from '@send-frontend/types';
import * as Sentry from '@sentry/vue';
import { MAX_CONCURRENT_PARTS, SPLIT_SIZE } from './const';
import {
  hashFiles,
  retryUntilSuccessOrTimeout,
  splitIntoMultipleZips,
} from './utils';

/**
 * Turn the (optional) {@link ApiCallFailure} from the create-entry call into a
 * descriptive Error to use as the thrown error's `cause`, so the underlying
 * reason (network vs HTTP status/body) survives in Sentry instead of being a
 * bare "Failed to create upload entry".
 */
function createEntryFailureToCause(failure: ApiCallFailure | undefined): Error {
  if (failure?.kind === 'http') {
    const suffix = failure.body ? `: ${failure.body}` : '';
    return new Error(
      `create-entry HTTP ${failure.status} ${failure.statusText}${suffix}`
    );
  }
  if (failure?.kind === 'network') {
    return failure.error instanceof Error
      ? failure.error
      : new Error(`create-entry network error: ${String(failure.error)}`);
  }
  // api.call returned null without reporting a failure (shouldn't normally
  // happen, but keep a non-empty cause rather than losing the signal).
  return new Error('create-entry returned no result');
}

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
   * Asks the backend to delete every part this upload attempt wrote to storage.
   * Called when a multipart upload fails partway so that already-uploaded (and
   * partially-uploaded) parts don't linger as orphaned bytes in the bucket.
   */
  private async deleteWrittenUploads(api: ApiConnection, ids: string[]) {
    if (ids.length === 0) {
      return;
    }
    await api.call('uploads/cleanup', { ids }, 'POST');
  }

  /**
   * Fire-and-forget cleanup for use during page teardown (pagehide), when an
   * upload is still in flight and the normal `if (fatalError)` cleanup will
   * never run. Uses a `keepalive` fetch so the request survives the page being
   * torn down, and cookie auth (`credentials: 'include'`) since requireJWT reads
   * the auth cookie — a Bearer header can't be attached reliably at unload time.
   * Best-effort only: hard kills/crashes still rely on the server-side reaper.
   */
  private teardownCleanup(api: ApiConnection, ids: string[]) {
    if (ids.length === 0) {
      return;
    }
    try {
      void fetch(`${api.serverUrl}/api/uploads/cleanup`, {
        method: 'POST',
        keepalive: true,
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // best-effort; nothing we can do at teardown
    }
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

    // When any part fails permanently we abort the in-flight PUTs of the other
    // parts (via this signal) and clean up every storage object we started
    // writing (tracked in `writtenUploadIds`) so no orphaned bytes are left in
    // the bucket.
    const abortController = new AbortController();
    const writtenUploadIds = new Set<string>();

    const uploadPart = async (
      blob: NamedBlob,
      index: number
    ): Promise<Item | null> => {
      const filename = blob.name;
      const isBucketStorage = api.isBucketStorage;

      const partTracker = multipartTracker.getPartTracker(index);

      // We set the part number starting from 1 to avoid problems with part 0 evaluating to false
      const part = shouldSplit ? index + 1 : undefined;

      // Encrypt + upload the part exactly once. The PUT owns its own
      // retry/backoff (uploadWithTracker) and honors the abort signal, so we
      // never re-encrypt or re-request a signed URL on a transient network
      // failure. sendBlob throws once the PUT retries are exhausted.
      const id = await sendBlob(blob, key, api, partTracker, isBucketStorage, {
        signal: abortController.signal,
        onUploadId: (uploadId) => writtenUploadIds.add(uploadId),
      });

      if (!id) {
        throw new Error('Failed to send blob');
      }

      // Wait for storage to confirm the object is fully written before creating
      // the DB entry. This is REQUIRED for bucket storage too: the object lands
      // via the S3 presigned PUT, but the backend size-check (create-entry)
      // reads via the native B2 API, which is not immediately read-after-write
      // consistent. Skipping this races that lag and makes create-entry fail
      // intermittently with UPLOAD_SIZE_ERROR (500). Poll up to 3 min.
      await retryUntilSuccessOrTimeout(
        async () => {
          const { size } = await this.api.call<{ size: null | number }>(
            `uploads/${id}/stat`
          );
          // Return a boolean, telling us if the size is null or not
          return !!size;
        },
        2_000,
        180_000
      );

      // Create the DB Content entry + Item. These are cheap POSTs, so we retry
      // them independently of the (already-completed) upload — a transient API
      // failure here must not re-drive the PUT or re-encrypt the blob.
      let uploadResult: {
        upload: UploadResponse;
        itemObj: ItemResponse;
      } | null = null;
      // The Upload row is created once and reused across retries: if create-entry
      // succeeds but item-creation fails, we must NOT re-POST /uploads (the id is
      // fixed, so a re-POST would race the same row). Hold the created row here so
      // a retry only re-attempts the step that actually failed.
      let upload: UploadResponse | null = null;
      let retryCount = 0;
      const maxRetries = 5;

      while (retryCount < maxRetries && !uploadResult) {
        // Stop retrying DB writes if a sibling part already doomed the upload.
        if (abortController.signal.aborted) {
          throw new Error('Upload aborted');
        }
        try {
          if (!upload) {
            // Create a Content entry in the database.
            // Capture why this call fails (network vs API 4xx/5xx + status) so
            // Sentry can break "Failed to create upload entry" down by cause and
            // rate. Observability only (#914) — no retry/timeout change here.
            let createEntryFailure: ApiCallFailure | undefined;
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
              'POST',
              {},
              {
                onFailure: (failure) => {
                  createEntryFailure = failure;
                },
              }
            );
            if (!result) {
              const cause = createEntryFailureToCause(createEntryFailure);
              Sentry.captureException(cause, {
                tags: {
                  upload_stage: 'create_entry',
                  create_entry_failure_kind:
                    createEntryFailure?.kind ?? 'unknown',
                  ...(createEntryFailure?.kind === 'http'
                    ? {
                        create_entry_http_status: String(
                          createEntryFailure.status
                        ),
                      }
                    : {}),
                },
                contexts: {
                  create_entry: {
                    kind: createEntryFailure?.kind ?? 'unknown',
                    status:
                      createEntryFailure?.kind === 'http'
                        ? createEntryFailure.status
                        : null,
                    statusText:
                      createEntryFailure?.kind === 'http'
                        ? createEntryFailure.statusText
                        : undefined,
                    body:
                      createEntryFailure?.kind === 'http'
                        ? createEntryFailure.body
                        : undefined,
                  },
                },
              });
              throw new Error('Failed to create upload entry', { cause });
            }
            upload = result.upload;
          }

          // Create the corresponding Item in the Container. This runs on every
          // retry until it succeeds; because `upload` is created once and reused,
          // a transient item-creation failure never re-POSTs /uploads.
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
          console.error(`Create-entry attempt ${retryCount} failed:`, error);

          if (retryCount >= maxRetries) {
            const failureMessage =
              `Upload failed for ${fileBlob.name} after ${maxRetries} attempts` +
              (part ? ` (part ${part})` : '');
            console.error(failureMessage, error);
            throw new Error(failureMessage);
          }

          // Wait before retrying (exponential backoff)
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, retryCount) * 1000)
          );
        }
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

    // Upload parts through a bounded-concurrency pool: up to
    // MAX_CONCURRENT_PARTS run at once and, as each finishes, the next queued
    // part starts immediately. There is no per-batch barrier, so a slow or
    // failing part never blocks unrelated parts from starting. The first part
    // that fails permanently records the error and aborts the rest.
    const uploadResponses: Item[] = new Array(blobs.length);
    let nextIndex = 0;
    let fatalError: unknown = null;

    const runWorker = async (): Promise<void> => {
      while (true) {
        if (fatalError) {
          return;
        }
        const index = nextIndex++;
        if (index >= blobs.length) {
          return;
        }
        try {
          const item = await uploadPart(blobs[index], index);
          if (!item) {
            throw new Error(`Upload part ${index} returned no item`);
          }
          uploadResponses[index] = item;
        } catch (error) {
          // First failure dooms the upload: record it and cancel the in-flight
          // PUTs of the sibling parts. Those PUTs are cancelled instead of
          // running to completion, so no more bytes are written past this point.
          if (!fatalError) {
            fatalError = error;
          }
          abortController.abort();
          return;
        }
      }
    };

    // If the tab is closed or navigated away while parts are still in flight,
    // the normal failure cleanup below never runs — so strand-proof it with a
    // teardown-time cleanup of whatever we've started writing. Registered only
    // for the duration of the pool run and removed in the finally.
    const onPageHide = () => this.teardownCleanup(api, [...writtenUploadIds]);
    window.addEventListener('pagehide', onPageHide);

    try {
      const workerCount = Math.min(MAX_CONCURRENT_PARTS, blobs.length);
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

      if (fatalError) {
        // Best-effort cleanup so a failed multipart upload doesn't strand bytes
        // in the bucket. Never let a cleanup failure mask the original error.
        await this.deleteWrittenUploads(api, [...writtenUploadIds]).catch(
          () => {}
        );

        const failureMessage =
          fatalError instanceof Error
            ? fatalError.message
            : `Upload failed for ${fileBlob.name}`;
        progressTracker.setProcessStage('error');
        progressTracker.setText(failureMessage);
        progressTracker.error = failureMessage;

        throw fatalError instanceof Error
          ? fatalError
          : new Error(failureMessage);
      }

      return uploadResponses;
    } finally {
      window.removeEventListener('pagehide', onPageHide);
    }
  }
}
