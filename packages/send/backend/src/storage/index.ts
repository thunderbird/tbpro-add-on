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
   * Backblaze's S3-compatible client. Used for presigned upload/download URLs
   * and, for every keyed operation we can express in S3 terms, for the
   * operation itself -- see the comments on `get`, `del` and `length`.
   */
  private directClient?: S3Client;
  private directBucket?: string;
  private directIsUsable = false;
  private isB2 = false;

  /**
   * Initialize the adapter.
   * @param config: StorageAdapterConfig - Optional configuration information. If omitted, we fall back to the filesystem.
   *
   * When configured for Backblaze, object *writes* go through the native API
   * (as of 2024-06-01 there were errors when writing via its S3 API), but keyed
   * *reads* and *deletes* go through the S3-compatible API, because the native
   * adapter has to resolve a file name to a file id by listing the bucket. See
   * `getObjectAsStream` in ./s3b2.ts for why that listing is not viable.
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

    // Credentials come from the config we were actually handed, falling back to
    // the environment. The storage test suites are constructed with TEST_B2_*
    // values and never set the production B2_* vars, so reading env alone would
    // leave them on the native path this class exists to avoid.
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
        'Backblaze is configured but its S3-compatible client is not ' +
          '(needs an endpoint, an application key id, an application key and a ' +
          'bucket name). Reads and deletes will fall back to the native B2 API, ' +
          'which resolves names through a single 1000-entry b2_list_file_names ' +
          'page and silently misses anything sorting past it.'
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
    // Built synchronously: an async assignment leaves a window right after
    // construction (and right after each renewal) in which `directClient` is
    // undefined and every call quietly takes the fallback path instead.
    this.directClient = createDirectClient(overrides);
  }

  /**
   * True when keyed S3 operations against the Backblaze bucket are available.
   *
   * Public because the live B2 suite asserts it. Without that assertion a
   * missing endpoint would silently drop reads and deletes back onto the
   * native listing path, and the suite would still pass -- the tests cannot
   * tell the two paths apart by behaviour alone on a small bucket, and this
   * change (cleanup plus a lifecycle rule) is precisely what keeps the test
   * bucket small. So the mode is asserted directly rather than inferred.
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
   * failing with UPLOAD_SIZE_ERROR on large/multipart uploads. The native
   * `sizeOf` additionally goes through the capped listing described in
   * ./s3b2.ts. Falls back to the native API if the S3 read fails or no direct
   * client is available.
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
   * On Backblaze this is a keyed S3 GetObject rather than the native
   * `getFileAsStream`, which can only find a file by listing the first 1000
   * names in the bucket. There is deliberately no fallback to the native path
   * here: falling back would turn a genuine S3 failure into a lookup that
   * appears to work for small buckets and cannot work for real ones. Errors
   * other than "not found" propagate with their own message.
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
        // Rethrown, not swallowed -- but logged on the way past, because the
        // download route turns any throw into a bare 404 and would otherwise
        // discard the only description of what actually went wrong.
        console.error(`Error reading "${id}" from storage:`, error);
        throw error;
      }
    }

    const result = await this.client.getFileAsStream(id);
    if (result.error) {
      // The adapter knows exactly why this failed; without this line the caller
      // only ever sees `null`, which is what made this class of bug so hard to
      // diagnose from CI logs.
      console.error(`Error reading "${id}" from storage: ${result.error}`);
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
   * object (see `deleteObject` in ./s3b2.ts). The native `removeFile` resolves
   * the name through the same capped listing as the read path and reports
   * success when it cannot find the name, so past that cap it deletes nothing
   * and says nothing.
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
