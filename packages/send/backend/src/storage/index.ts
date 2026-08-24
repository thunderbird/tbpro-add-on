import { S3Client } from '@aws-sdk/client-s3';
import {
  Storage,
  StorageAdapterConfig,
  StorageType,
} from '@tweedegolf/storage-abstraction';
import { Readable } from 'stream';
import {
  S3Settings,
  createS3Client,
  getObjectSize,
  getSignedUrl,
  getSignedUrlforDownload,
} from './s3b2';

const B2_CONFIG = {
  type: StorageType.B2,
  bucketName: process.env.B2_BUCKET_NAME,
  applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
};

/**
 * The Backblaze token lasts 24 hours and the native adapter authorizes exactly
 * once -- `authorize()` returns early forever after the first success and
 * nothing resets it on a 401. Rebuilding the adapter is the only way to get a
 * fresh token, so a long-lived process needs this or its deletes stop working
 * silently. Half the token's life, to leave room for a failure.
 */
const B2_ADAPTER_REFRESH_MS = 12 * 60 * 60 * 1000;

/**
 * How to reach the bucket over the S3 API, or undefined for a backend that has
 * no bucket. B2 names its S3 credentials `applicationKey*`; both spellings are
 * read so either backend's configuration works unchanged.
 */
function s3SettingsFor(config: StorageAdapterConfig): S3Settings | undefined {
  if (config.type !== StorageType.B2 && config.type !== StorageType.S3) {
    return undefined;
  }
  return {
    endpoint: config.endpoint,
    publicEndpoint: config.publicEndpoint,
    region: config.region,
    accessKeyId: config.accessKeyId ?? config.applicationKeyId,
    secretAccessKey: config.secretAccessKey ?? config.applicationKey,
    bucketName: config.bucketName,
    forcePathStyle: config.forcePathStyle,
  };
}

/**
 * Storage adapter for various storage backends including filesystem and Backblaze.
 */
export class FileStore {
  /**
   * A storage client instance.
   */
  private client: Storage;

  /**
   * The S3 data plane for this store: presigned upload/download URLs and the
   * size read. Undefined for filesystem storage. `presigner` differs from
   * `client` only where the browser reaches the bucket at a different host than
   * the backend does -- see the constructor.
   */
  private s3?: { client: S3Client; presigner: S3Client; bucket: string };

  /**
   * Initialize the adapter.
   * @param config: StorageAdapterConfig - Optional configuration information. If omitted, we fall back to the filesystem.
   *
   * When configured for Backblaze, uses the native API instead of the S3-compatible API
   * (As of 2024-06-01, there were errors when accessing Backblaze via its S3 API.)
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
            publicEndpoint: process.env.S3_PUBLIC_ENDPOINT,
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
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

    // Signed uploads and downloads go over the S3 API for both bucket backends,
    // built from this store's own settings rather than from `B2_*` -- otherwise
    // an `s3` deployment signs urls for the Backblaze bucket.
    //
    // All three are required, not just the bucket: `.env.sample` ships
    // `S3_ACCESS_KEY=`/`S3_SECRET_KEY=` empty, and a client built from those
    // signs nothing and throws on every request, forever. Ambient credentials
    // (IRSA, instance role) are deliberately not supported -- every deployment
    // sets explicit keys, and guessing is how a backend ends up signing for the
    // wrong bucket.
    const settings = s3SettingsFor(config);
    if (
      settings?.bucketName &&
      settings.accessKeyId &&
      settings.secretAccessKey
    ) {
      const client = createS3Client(settings);
      this.s3 = {
        client,
        // A presigned URL is only valid for the host it was signed for, and the
        // browser is the one that has to reach that host. In compose the
        // backend talks to MinIO at `minio:9000`, which means nothing outside
        // the container network, so the dev stack signs with a published
        // address instead. Production leaves `publicEndpoint` unset: one host
        // serves both.
        presigner: settings.publicEndpoint
          ? createS3Client({ ...settings, endpoint: settings.publicEndpoint })
          : client,
        bucket: settings.bucketName,
      };
    }

    // The S3-only keys go to the adapter too: both adapters read the keys they
    // know and ignore the rest.
    const adapterConfig = config;
    this.client = new Storage(adapterConfig);

    if (adapterConfig.type === StorageType.B2) {
      // See B2_ADAPTER_REFRESH_MS. unref'd so the timer never keeps a process
      // -- or a test run -- alive on its own.
      setInterval(() => {
        this.client = new Storage(adapterConfig);
      }, B2_ADAPTER_REFRESH_MS).unref();
    }
  }

  /** The S3 clients and bucket, or a throw if this store has no bucket. */
  private bucketApi(): {
    client: S3Client;
    presigner: S3Client;
    bucket: string;
  } {
    if (!this.s3) {
      throw new Error('Bucket storage is not configured');
    }
    return this.s3;
  }

  async getUploadBucketUrl(key: string, contentType: string) {
    const { presigner, bucket } = this.bucketApi();
    return await getSignedUrl(presigner, {
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });
  }

  async getDownloadBucketUrl(id: string) {
    const { presigner, bucket } = this.bucketApi();
    return await getSignedUrlforDownload(presigner, {
      Bucket: bucket,
      Key: id,
    });
  }

  /**
   * Returns the size of the file in bytes.
   * @param id: string - The unique identifier for the file.
   * @returns The size of the file in bytes.
   *
   * Note that an encrypted file's size is greater than or equal to the unencrypted file's size.
   *
   * For bucket storage, the size is read back through the same S3 API used to
   * upload the object (HeadObject). S3 is read-after-write consistent for an
   * object it just wrote, whereas B2's native `sizeOf` lags behind the S3 PUT —
   * that lag was the root cause of create-entry failing with UPLOAD_SIZE_ERROR
   * on large/multipart uploads. Falls back to the adapter if the S3 read fails.
   */
  async length(id: string): Promise<number> {
    if (this.s3) {
      try {
        return await getObjectSize(this.s3.client, {
          Bucket: this.s3.bucket,
          Key: id,
        });
      } catch (error) {
        console.error(
          'S3 HeadObject size read failed; falling back to the adapter:',
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
   * @returns A readable stream for the file.
   */
  async get(id: string): Promise<Readable> {
    const result = await this.client.getFileAsStream(id);
    return result.value;
  }

  /**
   * Removes a file from storage.
   * @param id: string - The unique identifier for the file.
   * @returns True if the file was successfully removed; otherwise false.
   *
   * No error is thrown if the file is not found.
   */
  del(id: string): Promise<boolean> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      const result = await this.client.removeFile(id);
      if (result.value === 'ok') {
        resolve(true);
      } else {
        reject(result.error);
      }
    });
  }
}

// export a FileStore based on .env vars
export default new FileStore();
