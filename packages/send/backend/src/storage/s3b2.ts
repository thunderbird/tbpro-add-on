import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getSignedUrlCommand } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

/**
 * Connection details for Backblaze's S3-compatible API.
 *
 * Everything here can come either from the process environment (production,
 * where the FileStore is built from `B2_*` vars) or from an explicit
 * StorageAdapterConfig (the storage test suites, which are handed `TEST_B2_*`
 * values and must not depend on the production vars being set).
 */
export type B2DirectConfig = {
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
};

/**
 * Merge caller-supplied values over the environment. Env is read here, at call
 * time, rather than at module load, so that a FileStore constructed with an
 * explicit config is not silently bound to whatever `B2_BUCKET_NAME` happened
 * to be set to when this module was first imported.
 */
export function resolveDirectConfig(
  overrides: B2DirectConfig = {}
): B2DirectConfig {
  return {
    endpoint: overrides.endpoint || process.env.B2_ENDPOINT,
    region: overrides.region || process.env.B2_REGION || 'auto',
    accessKeyId: overrides.accessKeyId || process.env.B2_APPLICATION_KEY_ID,
    secretAccessKey:
      overrides.secretAccessKey || process.env.B2_APPLICATION_KEY,
    bucketName: overrides.bucketName || process.env.B2_BUCKET_NAME,
  };
}

/**
 * True when we have enough to actually talk to the S3 endpoint. Used to decide
 * whether the direct (keyed) read path is available; when it is not, callers
 * fall back to the native B2 API and should say so loudly.
 */
export function isDirectConfigUsable(config: B2DirectConfig): boolean {
  return Boolean(
    config.endpoint &&
    config.accessKeyId &&
    config.secretAccessKey &&
    config.bucketName
  );
}

export function createDirectClient(
  overrides: B2DirectConfig = {}
): S3Client | undefined {
  const config = resolveDirectConfig(overrides);
  try {
    return new S3Client({
      // Only set the endpoint when we have one; passing `undefined` stringified
      // produces a client that fails in a confusing way at request time.
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      region: config.region || 'auto',
      credentials: {
        accessKeyId: config.accessKeyId ?? '',
        secretAccessKey: config.secretAccessKey ?? '',
      },
      requestHandler: { requestTimeout: 30000 },
      maxAttempts: 3,
    });
  } catch (error) {
    console.error('Could not construct the S3 client for Backblaze:', error);
    return undefined;
  }
}

/**
 * A 404-shaped failure: the object genuinely is not there.
 *
 * Distinguishing this from every other error is what keeps the read path
 * honest -- a missing object resolves to `null` (caller renders a 404, the
 * storage test fails), while an auth, network, or bucket misconfiguration
 * throws with its own message instead of being flattened into "not found".
 */
export function isNotFoundError(error: unknown): boolean {
  const err = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    err?.name === 'NoSuchKey' ||
    err?.name === 'NotFound' ||
    err?.$metadata?.httpStatusCode === 404
  );
}

export async function getSignedUrl(
  s3Client: S3Client,
  Key: string,
  ContentType: string,
  Bucket: string = process.env.B2_BUCKET_NAME
) {
  // Set up the command parameters
  const command = new PutObjectCommand({
    Bucket,
    Key,
    ContentType,
  });

  // Generate the presigned URL (expires in 3600 seconds / 1 hour by default)
  const signedUrl = await getSignedUrlCommand(s3Client, command, {
    expiresIn: 3600,
  });
  return signedUrl;
}

/**
 * Read an object's size via the S3 API (HeadObject).
 *
 * Objects are uploaded with a presigned S3 PUT, and S3 is read-after-write
 * consistent for an object it just wrote — unlike Backblaze's native API, whose
 * `sizeOf` lags behind the S3 write and caused create-entry to fail with
 * UPLOAD_SIZE_ERROR. Using the same S3 client that issued the PUT removes that
 * race.
 */
export async function getObjectSize(
  s3Client: S3Client,
  Key: string,
  Bucket: string = process.env.B2_BUCKET_NAME
): Promise<number> {
  const command = new HeadObjectCommand({
    Bucket,
    Key,
  });
  const response = await s3Client.send(command);
  return response.ContentLength ?? 0;
}

/**
 * Read an object's body via the S3 API (GetObject).
 *
 * This is a keyed lookup: one request, by name, no listing. The native B2
 * adapter cannot do that -- `getFileAsStream` has to turn a file *name* into a
 * file *id* first, and it does so by calling `b2_list_file_names` once with
 * `maxFileCount: 1000`, no prefix and no `startFileName`, then scanning the
 * page in memory (see node_modules/@tweedegolf/sab-adapter-backblaze-b2,
 * `getFiles` -> `getFile`). B2 returns names in lexicographic order, so as soon
 * as a bucket holds 1000 names sorting before the one you want, the native read
 * returns "Could not find file" forever. That is a cliff, not a race: waiting
 * or retrying never recovers it.
 *
 * @returns the object body, or `null` if the object does not exist. Any other
 *          failure (auth, network, wrong bucket) throws.
 */
export async function getObjectAsStream(
  s3Client: S3Client,
  Key: string,
  Bucket: string = process.env.B2_BUCKET_NAME
): Promise<Readable | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket,
        Key,
      })
    );
    return (response.Body as Readable) ?? null;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Delete an object via the S3 API (DeleteObject).
 *
 * Same reasoning as the read path. The native adapter's `removeFile` resolves
 * the name through that identical capped listing and, when it cannot find the
 * name, returns `{ value: "ok" }` -- a silent no-op reported as success. Past
 * the 1000-name cliff, deletes stop happening and nothing says so, which is how
 * the test bucket grew unboundedly in the first place.
 *
 * DeleteObject is idempotent, so deleting an absent key still succeeds; that
 * matches the adapter's documented "no error if the file is not found".
 *
 * Note the versioning difference this introduces, deliberately: B2 buckets are
 * versioned, so an S3 DeleteObject hides the object (the object is gone as far
 * as every read path is concerned) and leaves the prior version for the
 * bucket's lifecycle rule to reap, whereas the native `b2_delete_file_version`
 * removed it immediately. Confirm the bucket has a lifecycle rule covering the
 * prefixes it actually stores -- see b2/README.md. This is still strictly more
 * deletion than the native path performed, which past the listing cap deleted
 * nothing at all and reported success.
 */
export async function deleteObject(
  s3Client: S3Client,
  Key: string,
  Bucket: string = process.env.B2_BUCKET_NAME
): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket,
      Key,
    })
  );
}

export async function getSignedUrlforDownload(
  s3Client: S3Client,
  Key: string,
  Bucket: string = process.env.B2_BUCKET_NAME
) {
  // Set up the command parameters
  const command = new GetObjectCommand({
    Bucket,
    Key,
  });

  // Generate the presigned URL (expires in 3600 seconds / 1 hour by default)
  const signedUrl = await getSignedUrlCommand(s3Client, command, {
    expiresIn: 3600,
  });
  return signedUrl;
}
