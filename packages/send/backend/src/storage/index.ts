import { S3Client } from '@aws-sdk/client-s3';
import { ReadStream } from 'fs';
import { Readable } from 'stream';
import { LocalStorage } from './local';
import {
  S3Settings,
  createS3Client,
  deleteObject,
  getObjectAsStream,
  getObjectSize,
  getSignedUrl,
  getSignedUrlforDownload,
  isS3SettingsUsable,
  resolveS3Settings,
  uploadObject,
} from './s3b2';

export enum StorageType {
  LOCAL = 'local',
  S3 = 's3',
  B2 = 'b2',
}

/**
 * B2 names its S3 credentials `applicationKey*`; both spellings are accepted so
 * either backend's environment reads naturally.
 */
export type StorageAdapterConfig = {
  type: StorageType;
  bucketName?: string;
  directory?: string;
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  applicationKeyId?: string;
  applicationKey?: string;
};

const B2_CONFIG: StorageAdapterConfig = {
  type: StorageType.B2,
  bucketName: process.env.B2_BUCKET_NAME,
  applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
};

/**
 * Storage for uploaded files, over Backblaze B2, S3 or the local filesystem.
 *
 * B2 and S3 are one path: B2's S3-compatible API takes the same commands, so
 * both run on the client and helpers in ./s3b2.ts.
 */
export class FileStore {
  private s3Client?: S3Client;
  private bucket?: string;
  private local?: LocalStorage;
  private isS3Compatible = false;

  /**
   * @param config: StorageAdapterConfig - Optional configuration information. If omitted, we fall back to the filesystem.
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

    this.isS3Compatible =
      config.type === StorageType.B2 || config.type === StorageType.S3;

    if (!this.isS3Compatible) {
      this.local = new LocalStorage(config.directory, config.bucketName);
      return;
    }

    // From the config we were handed, falling back to env inside
    // `resolveS3Settings`. The test suites are built with TEST_B2_*/TEST_S3_*
    // and never set the production vars, so reading env alone would leave them
    // unconfigured.
    const settings: S3Settings = {
      endpoint: config.endpoint,
      region: config.region,
      accessKeyId: config.accessKeyId || config.applicationKeyId,
      secretAccessKey: config.secretAccessKey || config.applicationKey,
      bucketName: config.bucketName,
    };

    const resolved = resolveS3Settings(settings);
    this.bucket = resolved.bucketName;
    this.s3Client = isS3SettingsUsable(resolved)
      ? createS3Client(resolved)
      : undefined;

    if (!this.s3Client) {
      console.error(
        `Bucket storage is configured as "${config.type}" but its S3 client is ` +
          'not (needs an endpoint, an access key id, a secret and a bucket ' +
          'name). Every read, write and delete will fail.'
      );
    }
  }

  /**
   * True when the S3 client is ready. Public because the live bucket suites
   * assert it: in CI they run unconditionally, so a credential that went
   * missing should fail as one legible assertion rather than a pile of them.
   */
  usesKeyedApi(): boolean {
    return this.isS3Compatible && Boolean(this.s3Client && this.bucket);
  }

  private client(): S3Client {
    if (!this.s3Client) {
      throw new Error('Bucket storage is not configured');
    }
    return this.s3Client;
  }

  async getUploadBucketUrl(key: string, contentType: string) {
    return await getSignedUrl(this.client(), key, contentType, this.bucket);
  }

  async getDownloadBucketUrl(id: string) {
    return await getSignedUrlforDownload(this.client(), id, this.bucket);
  }

  /**
   * Add a new file to storage.
   * @param id: string - The unique identifier for the file.
   * @param stream: ReadStream - A readable stream of the file's contents.
   * @param size: number - The expected size in bytes, when the caller knows it.
   * @returns True if the file was added without error; otherwise false.
   */
  async set(id: string, stream: ReadStream, size?: number): Promise<boolean> {
    try {
      if (this.local) {
        await this.local.set(id, stream);
      } else {
        await uploadObject(this.client(), id, stream, this.bucket, size);
      }
      return true;
    } catch (error) {
      console.error('Error writing to storage:', id, error);
      return false;
    }
  }

  /**
   * Returns the size of the file in bytes.
   * @param id: string - The unique identifier for the file.
   * @returns The size of the file in bytes.
   *
   * Note that an encrypted file's size is greater than or equal to the unencrypted file's size.
   */
  async length(id: string): Promise<number> {
    if (this.local) {
      return await this.local.length(id);
    }
    return await getObjectSize(this.client(), id, this.bucket);
  }

  /**
   * Returns a readable stream for a file in storage.
   * @param id: string - The unique identifier for the file.
   * @returns A readable stream for the file, or null if it does not exist.
   *
   * Anything other than "not found" propagates.
   */
  async get(id: string): Promise<Readable> {
    if (this.local) {
      return await this.local.get(id);
    }
    try {
      return await getObjectAsStream(this.client(), id, this.bucket);
    } catch (error) {
      // Logged on the way past: the download route turns any throw into a
      // bare 404, discarding the only description of what went wrong.
      console.error('Error reading object from storage:', id, error);
      throw error;
    }
  }

  /**
   * Removes a file from storage.
   * @param id: string - The unique identifier for the file.
   * @returns True if the file was successfully removed; otherwise false.
   *
   * No error is thrown if the file is not found.
   */
  async del(id: string): Promise<boolean> {
    if (this.local) {
      await this.local.del(id);
      return true;
    }
    await deleteObject(this.client(), id, this.bucket);
    return true;
  }
}

// export a FileStore based on .env vars
export default new FileStore();
