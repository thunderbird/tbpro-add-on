import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getSignedUrlCommand } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

/**
 * Backblaze's S3-compatible API.
 *
 * Keyed reads and deletes live here because the native adapter cannot look a
 * file up by name: `getFileAsStream` and `removeFile` resolve name -> fileId by
 * calling `b2_list_file_names` once with `maxFileCount: 1000`, no prefix and no
 * `startFileName`, then scanning that single page (`getFiles` -> `getFile` in
 * @tweedegolf/sab-adapter-backblaze-b2; `nextFileName` appears nowhere in it).
 * B2 returns names lexicographically, so once 1000 names sort ahead of the key,
 * reads return "not found" and deletes report success having deleted nothing.
 * A keyed S3 request has no such cap.
 */

/**
 * Connection details, from an explicit config (the test suites, handed
 * `TEST_B2_*`) or from the environment (production, `B2_*`).
 */
export type B2DirectConfig = {
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
};

/**
 * Merge caller values over the environment. Env is read at call time, not at
 * module load, so a FileStore built with an explicit config is not bound to
 * whatever `B2_BUCKET_NAME` held when this module was first imported.
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

/** True when we have enough to reach the S3 endpoint. */
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
      // Omit rather than pass undefined: a stringified undefined endpoint
      // fails confusingly at request time.
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

/** Bucket-level failures. S3 answers some with 404, but they are not "absent". */
const BUCKET_LEVEL_ERROR_NAMES = new Set([
  'NoSuchBucket',
  'InvalidBucketName',
  'PermanentRedirect',
]);

export function isNotFoundError(error: unknown): boolean {
  const err = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  // Subtracted first: otherwise a typo'd bucket name reads as "object absent"
  // and every download 404s with nothing logged.
  if (err?.name && BUCKET_LEVEL_ERROR_NAMES.has(err.name)) {
    return false;
  }
  return (
    err?.name === 'NoSuchKey' ||
    err?.name === 'NotFound' ||
    // S3-compatible implementations differ on the error *name* for a missing key.
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
 * Read an object's body by key (GetObject). One request, no listing.
 *
 * @returns the body, or `null` if the object does not exist. Any other failure
 *          (auth, network, wrong bucket) throws.
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
 * Every version id under exactly this key, including delete markers. `Prefix`
 * narrows the request; the exact `Key` match below discards neighbours sharing
 * it. Paginated to the end -- a cap here would strand versions.
 */
async function listVersionIds(
  s3Client: S3Client,
  Key: string,
  Bucket: string
): Promise<string[]> {
  const versionIds: string[] = [];
  let KeyMarker: string | undefined;
  let VersionIdMarker: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectVersionsCommand({
        Bucket,
        Prefix: Key,
        KeyMarker,
        VersionIdMarker,
      })
    );

    for (const entry of [
      ...(response.Versions ?? []),
      ...(response.DeleteMarkers ?? []),
    ]) {
      if (entry.Key === Key && entry.VersionId) {
        versionIds.push(entry.VersionId);
      }
    }

    KeyMarker = response.IsTruncated ? response.NextKeyMarker : undefined;
    VersionIdMarker = response.IsTruncated
      ? response.NextVersionIdMarker
      : undefined;
  } while (KeyMarker || VersionIdMarker);

  return versionIds;
}

/**
 * Delete an object by key, erasing every version of it.
 *
 * B2 buckets are versioned, so a bare `DeleteObject` only writes a hide marker
 * and leaves the payload behind until a lifecycle rule reaps it. The native
 * `b2_delete_file_version` this replaces erased the bytes, and a user pressing
 * delete on a shared file should keep getting that, so the versions are
 * enumerated and removed explicitly.
 *
 * Deleting an absent key succeeds, matching the adapter's documented behaviour.
 */
export async function deleteObject(
  s3Client: S3Client,
  Key: string,
  Bucket: string = process.env.B2_BUCKET_NAME
): Promise<void> {
  let versionIds: string[] = [];

  try {
    versionIds = await listVersionIds(s3Client, Key, Bucket);
  } catch (error) {
    // Needs list permission. Without it, degrade to the unversioned delete
    // rather than failing outright -- but say so: that path only hides.
    console.error(
      'Could not list versions before deleting; falling back to an ' +
        'unversioned delete, which hides rather than erases. Key:',
      Key,
      error
    );
  }

  if (versionIds.length === 0) {
    // Unversioned bucket, already gone, or the listing failed -- idempotent.
    await s3Client.send(new DeleteObjectCommand({ Bucket, Key }));
    return;
  }

  for (const VersionId of versionIds) {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket,
        Key,
        VersionId,
      })
    );
  }
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
