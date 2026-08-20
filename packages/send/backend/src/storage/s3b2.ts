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
 * find a file, so neither cost nor correctness degrades as the bucket fills.
 */

/** Connection details for one bucket. The caller resolves them; see ./index.ts. */
export type S3Settings = {
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
};

/**
 * True when we have enough to reach the bucket.
 *
 * @param needsEndpoint - B2 is only reachable at its own endpoint, so omitting
 *   it would silently address AWS with B2 credentials. AWS S3 derives an
 *   endpoint from the region, so there it stays optional.
 */
export function isS3SettingsUsable(
  config: S3Settings,
  { needsEndpoint = false } = {}
): boolean {
  return Boolean(
    config.bucketName &&
    config.accessKeyId &&
    config.secretAccessKey &&
    (config.endpoint || (!needsEndpoint && config.region))
  );
}

export function createS3Client(config: S3Settings): S3Client {
  return new S3Client({
    // Omit rather than pass undefined: a stringified undefined endpoint fails
    // confusingly at request time.
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    // Required by the SDK even when the endpoint decides where requests go.
    region: config.region || 'auto',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestHandler: { requestTimeout: 30000 },
    maxAttempts: 3,
  });
}

/**
 * Bucket-level failures. Some answer with a 404, but they are not "absent": a
 * wrong bucket name must fail loudly, not 404 every download with nothing
 * logged.
 */
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
 * S3 caps a multipart upload at 10 000 parts and requires every part but the
 * last to be at least 5 MiB, so parts have to widen for a body larger than
 * 50 GB. The ceiling bounds that: `size` is declared by the client, and each
 * part is held whole in memory while it uploads. 32 MiB covers 320 GB.
 */
const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_PART_SIZE_BYTES = 32 * 1024 * 1024;
const MAX_PARTS = 10_000;

export function partSizeFor(size?: number): number {
  if (!Number.isFinite(size) || size <= 0) {
    return MIN_PART_SIZE_BYTES;
  }
  return Math.min(
    MAX_PART_SIZE_BYTES,
    Math.max(MIN_PART_SIZE_BYTES, Math.ceil(size / MAX_PARTS))
  );
}

/**
 * Write an object from a stream.
 *
 * `Upload` splits the body into parts and switches to a multipart upload once
 * there is more than one, so it needs no length up front -- callers hand us a
 * socket. One part in flight, since each queued part is held whole in memory.
 *
 * `Readable.from` because `Upload` infers a content length by duck-typing
 * `length`/`size`/`byteLength` off the body, and a Transform carrying any of
 * them (a byte counter, say) yields a part count it then asserts against and
 * fails. A wrapper presents no such property, and unlike `pipe` it forwards
 * the source's errors, so an aborted upload still aborts the multipart.
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
    params: { Bucket, Key, Body: Readable.from(Body) },
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
 * and leaves the payload behind until a lifecycle rule reaps it.
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
