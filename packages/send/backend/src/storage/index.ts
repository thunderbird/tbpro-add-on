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

/**
 * Each backend reads only its own variables. Sharing a fallback between them
 * would let a half-configured `s3` deployment resolve, field by field, onto the
 * B2 bucket and credentials -- reporting healthy while writing user files
 * somewhere nobody selected.
 */
function configFromEnv(): StorageAdapterConfig {
  switch (process.env.STORAGE_BACKEND) {
    case 'b2':
      console.log(`Initializing Backblaze storage ☁️`);
      return {
        type: StorageType.B2,
        bucketName: process.env.B2_BUCKET_NAME,
        applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
        applicationKey: process.env.B2_APPLICATION_KEY,
        endpoint: process.env.B2_ENDPOINT,
        region: process.env.B2_REGION || 'auto',
      };
    case 's3':
      console.log(`Initializing S3 storage ☁️`);
      return {
        type: StorageType.S3,
        region: process.env.S3_REGION,
        bucketName: process.env.S3_BUCKET_NAME,
        endpoint: process.env.S3_ENDPOINT,
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
      };
    default:
      console.log(`Initializing local filesystem storage 💾`);
      return {
        type: StorageType.LOCAL,
        directory: process.env.FS_LOCAL_DIR,
        bucketName: process.env.FS_LOCAL_BUCKET,
      };
  }
}

/**
 * Storage for uploaded files, over Backblaze B2, S3 or the local filesystem.
 *
 * B2 and S3 both run on ./s3b2.ts.
 */
export class FileStore {
  private s3Client?: S3Client;
  private bucket?: string;
  private local?: LocalStorage;

  /**
   * @param config: StorageAdapterConfig - Optional configuration information. If omitted, we fall back to the filesystem.
   */
  constructor(config: StorageAdapterConfig = configFromEnv()) {
    switch (config.type) {
      case StorageType.B2:
      case StorageType.S3:
        break;
      case StorageType.LOCAL:
        this.local = new LocalStorage(config.directory, config.bucketName);
        return;
      default:
        // An unrecognised backend must not quietly become the filesystem: on a
        // bucket deployment that is user uploads written to ephemeral disk.
        throw new Error(`Unknown storage backend: ${config.type}`);
    }

    const settings: S3Settings = {
      endpoint: config.endpoint,
      region: config.region,
      accessKeyId: config.accessKeyId || config.applicationKeyId,
      secretAccessKey: config.secretAccessKey || config.applicationKey,
      bucketName: config.bucketName,
    };
    const needsEndpoint = config.type === StorageType.B2;

    this.bucket = settings.bucketName;
    this.s3Client = isS3SettingsUsable(settings, { needsEndpoint })
      ? createS3Client(settings)
      : undefined;

    if (!this.s3Client) {
      console.error(
        `Bucket storage is configured as "${config.type}" but its S3 client is ` +
          'not (needs an access key id, a secret, a bucket name, and ' +
          `${needsEndpoint ? 'an endpoint' : 'an endpoint or a region'}). ` +
          'Every read, write and delete will fail.'
      );
    }
  }

  /** True when the S3 client and bucket are both configured. */
  usesKeyedApi(): boolean {
    return Boolean(this.s3Client && this.bucket);
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
