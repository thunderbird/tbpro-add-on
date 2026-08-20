import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl as getSignedUrlCommand } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

/**
 * The S3 data plane. Backblaze B2 and S3 share it: B2's S3-compatible API
 * speaks the same commands, so one implementation serves both backends.
 *
 * Every operation addresses an object by key. Nothing here lists a bucket to
 * find a file, so cost and correctness do not degrade as the bucket fills.
 */

/**
 * Connection details, from an explicit config (the test suites, handed
 * `TEST_B2_*`/`TEST_S3_*`) or from the environment.
 */
export type S3Settings = {
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
};

/**
 * Merge caller values over the environment; the environment here is the B2
 * deployment's `B2_*`, since an S3 one passes its own values in. Env is read at
 * call time, not at module load, so a FileStore built with an explicit config
 * is not bound to whatever `B2_BUCKET_NAME` held when this module was first
 * imported.
 */
export function resolveS3Settings(overrides: S3Settings = {}): S3Settings {
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
export function isS3SettingsUsable(config: S3Settings): boolean {
  return Boolean(
    config.endpoint &&
    config.accessKeyId &&
    config.secretAccessKey &&
    config.bucketName
  );
}

export function createS3Client(
  overrides: S3Settings = {}
): S3Client | undefined {
  const config = resolveS3Settings(overrides);
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
    console.error('Could not construct the S3 client:', error);
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
  Bucket: string
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
 * S3 caps a multipart upload at 10 000 fixed-size parts, and requires every
 * part but the last to be at least 5 MiB. 5 MiB parts therefore cover 50 GB,
 * comfortably past `config.max_file_size`; a larger declared size widens the
 * parts rather than running out of them.
 */
const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_PARTS = 10_000;

export function partSizeFor(size?: number): number {
  return size
    ? Math.max(MIN_PART_SIZE_BYTES, Math.ceil(size / MAX_PARTS))
    : MIN_PART_SIZE_BYTES;
}

/**
 * Write an object from a stream.
 *
 * `Upload` buffers the body into parts and switches to a multipart upload once
 * there is more than one, so a write is bounded by the multipart limit rather
 * than the 5 GB a single request allows, and needs no length up front. One
 * part in flight: the source is a socket, and each queued part is held whole in
 * memory.
 */
export async function uploadObject(
  s3Client: S3Client,
  Key: string,
  Body: Readable,
  Bucket: string,
  size?: number
): Promise<void> {
  await new Upload({
    client: s3Client,
    params: { Bucket, Key, Body },
    partSize: partSizeFor(size),
    queueSize: 1,
    leavePartsOnError: false,
  }).done();
}

/**
 * Read an object's size (HeadObject).
 *
 * Reading the size back through the same API that wrote the object is what
 * makes create-entry's size check reliable: S3 is read-after-write consistent
 * for an object it just wrote.
 */
export async function getObjectSize(
  s3Client: S3Client,
  Key: string,
  Bucket: string
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
  Bucket: string
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
 * and leaves the payload behind until a lifecycle rule reaps it. A user
 * pressing delete on a shared file expects the bytes gone, so the versions are
 * enumerated and removed explicitly.
 *
 * Deleting an absent key succeeds.
 */
export async function deleteObject(
  s3Client: S3Client,
  Key: string,
  Bucket: string
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
  Bucket: string
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
