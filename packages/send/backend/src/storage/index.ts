import { S3Client } from '@aws-sdk/client-s3';
import {
  Storage,
  StorageAdapterConfig,
  StorageType,
} from '@tweedegolf/storage-abstraction';
import { FileStreamParams } from '@tweedegolf/storage-abstraction/dist/types/add_file_params';
import { ReadStream } from 'fs';
import { Readable } from 'stream';
import {
  B2DirectConfig,
  createDirectClient,
  deleteObject,
  getObjectAsStream,
  getObjectSize,
  getSignedUrl,
  getSignedUrlforDownload,
  isDirectConfigUsable,
  resolveDirectConfig,
} from './s3b2';

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

const B2_CONFIG = {
  type: StorageType.B2,
  bucketName: process.env.B2_BUCKET_NAME,
  applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
};

/**
 * Storage adapter for various storage backends including filesystem and Backblaze.
 */
export class FileStore {
  /**
   * A storage client instance.
   */
  private client: Storage;

  /**
   * Backblaze's S3-compatible client: presigned URLs, plus every operation we
   * can express as a keyed request. See ./s3b2.ts for why.
   */
  private directClient?: S3Client;
  private directBucket?: string;
  private directIsUsable = false;
  private isB2 = false;

  /**
   * Initialize the adapter.
   * @param config: StorageAdapterConfig - Optional configuration information. If omitted, we fall back to the filesystem.
   *
   * When configured for Backblaze, *writes* go through the native API (as of
   * 2024-06-01 there were errors writing via its S3 API); keyed *reads* and
   * *deletes* go through the S3-compatible API instead, for the reason
   * documented at the top of ./s3b2.ts.
   */
  constructor(config?: StorageAdapterConfig) {
    if (!config) {
      switch (process.env.STORAGE_BACKEND) {
        case 'b2':
          config = B2_CONFIG;
          console.log(`Initializing Backblaze storage ☁️`);
          break;
        case 's3':
          config = {
            type: StorageType.S3,
            region: process.env.S3_REGION || 'auto',
            bucketName: process.env.S3_BUCKET_NAME,
            endpoint: process.env.S3_ENDPOINT,
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
          };
          console.log(`Initializing S3 storage ☁️`);
          break;
        case 'fs':
        // intentional fall-through;
        // fs is default
        // eslint-disable-next-line no-fallthrough
        default:
          config = {
            type: StorageType.LOCAL,
            directory: process.env.FS_LOCAL_DIR,
            bucketName: process.env.FS_LOCAL_BUCKET,
          };
          console.log(`Initializing local filesystem storage 💾`);
          break;
      }
    }

    const storageConfig = config;
    this.isB2 = storageConfig.type === StorageType.B2;
    this.client = new Storage(storageConfig);

    // From the config we were handed, falling back to env. The test suites are
    // built with TEST_B2_* and never set the production B2_* vars, so reading
    // env alone would leave them on the native path.
    const directOverrides: B2DirectConfig = this.isB2
      ? {
          endpoint: storageConfig.endpoint,
          region: storageConfig.region,
          accessKeyId: storageConfig.applicationKeyId,
          secretAccessKey: storageConfig.applicationKey,
          bucketName: storageConfig.bucketName,
        }
      : {};

    this.setUpDirectClient(directOverrides);

    if (this.isB2 && !this.directIsUsable) {
      console.error(
        'Backblaze is configured but its S3-compatible client is not (needs ' +
          'an endpoint, an application key id, an application key and a bucket ' +
          'name). Reads and deletes fall back to the native B2 API, which ' +
          'silently misses anything past the first 1000 names in the bucket.'
      );
    }

    /* Backblaze's token only lasts 24 hours, so we renew it before that */
    if (this.isB2) {
      setInterval(() => {
        console.log('Renewing client');
        this.client = new Storage(storageConfig);
        this.setUpDirectClient(directOverrides);
      }, TWELVE_HOURS);
    }
  }

  private setUpDirectClient(overrides: B2DirectConfig) {
    const directConfig = resolveDirectConfig(overrides);
    this.directBucket = directConfig.bucketName;
    this.directIsUsable = isDirectConfigUsable(directConfig);
    // Synchronous: an async assignment leaves a window after construction, and
    // after each renewal, where every call quietly takes the fallback path.
    this.directClient = createDirectClient(overrides);
  }

  /**
   * True when keyed S3 operations are available. Public because the live B2
   * suite asserts it: on a small bucket the two paths behave identically, so a
   * missing endpoint would drop reads onto the native path and every test would
   * still pass.
   */
  usesKeyedApi(): boolean {
    return this.isB2 && this.directIsUsable && Boolean(this.directClient);
  }

  async getUploadBucketUrl(key: string, contentType: string) {
    return await getSignedUrl(
      this.directClient,
      key,
      contentType,
      this.directBucket
    );
  }

  async getDownloadBucketUrl(id: string) {
    return await getSignedUrlforDownload(
      this.directClient,
      id,
      this.directBucket
    );
  }

  /**
   * Add a new file to storage.
   * @param id: string - The unique identifier for the file.
   * @param stream: ReadStream - A readable stream of the file's contents.
   * @returns True if the file was added without error; otherwise false.
   */
  async set(id: string, stream: ReadStream, size?: number): Promise<boolean> {
    const params: FileStreamParams = {
      stream,
      targetPath: id,
    };

    if (size) {
      params.options = {
        ContentLength: size,
      };
    }

    const result = await this.client.addFileFromStream(params);
    if (result.error) {
      console.error(`Error writing to storage: ${result.error}`);
    }
    return !result.error;
  }

  /**
   * Returns the size of the file in bytes.
   * @param id: string - The unique identifier for the file.
   * @returns The size of the file in bytes.
   *
   * Note that an encrypted file's size is greater than or equal to the unencrypted file's size.
   *
   * For Backblaze bucket storage, the size is read back through the same S3 API
   * used to upload the object (HeadObject via the direct client). S3 is
   * read-after-write consistent for an object it just wrote, whereas B2's native
   * `sizeOf` lags behind the S3 PUT — that lag was the root cause of create-entry
   * failing with UPLOAD_SIZE_ERROR on large/multipart uploads. Falls back to
   * the native API if the S3 read fails or no direct client is available.
   */
  async length(id: string): Promise<number> {
    if (this.usesKeyedApi()) {
      try {
        return await getObjectSize(this.directClient, id, this.directBucket);
      } catch (error) {
        console.error(
          'S3 HeadObject size read failed; falling back to native B2 API:',
          error
        );
      }
    }
    const result = await this.client.sizeOf(id);
    return result.value;
  }

  /**
   * Returns a readable stream for a file in storage.
   * @param id: string - The unique identifier for the file.
   * @returns A readable stream for the file, or null if it does not exist.
   *
   * On Backblaze this is a keyed S3 GetObject. There is deliberately no
   * fallback to the native path: falling back would turn a genuine S3 failure
   * into a lookup that works only for small buckets. Errors other than "not
   * found" propagate.
   */
  async get(id: string): Promise<Readable> {
    if (this.usesKeyedApi()) {
      try {
        return await getObjectAsStream(
          this.directClient,
          id,
          this.directBucket
        );
      } catch (error) {
        // Logged on the way past: the download route turns any throw into a
        // bare 404, discarding the only description of what went wrong.
        console.error('Error reading object from storage:', id, error);
        throw error;
      }
    }

    const result = await this.client.getFileAsStream(id);
    if (result.error) {
      // Without this the caller only ever sees `null`, which is what made this
      // bug so hard to diagnose from CI logs.
      console.error('Error reading object from storage:', id, result.error);
    }
    return result.value;
  }

  /**
   * Removes a file from storage.
   * @param id: string - The unique identifier for the file.
   * @returns True if the file was successfully removed; otherwise false.
   *
   * No error is thrown if the file is not found.
   *
   * On Backblaze this is a keyed S3 delete that removes every version of the
   * object (see `deleteObject` in ./s3b2.ts). The native `removeFile` reports
   * success for a name it merely failed to find.
   */
  async del(id: string): Promise<boolean> {
    if (this.usesKeyedApi()) {
      await deleteObject(this.directClient, id, this.directBucket);
      return true;
    }

    const result = await this.client.removeFile(id);
    if (result.value === 'ok') {
      return true;
    }
    throw result.error;
  }
}

// export a FileStore based on .env vars
export default new FileStore();
