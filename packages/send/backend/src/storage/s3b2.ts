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
  // Bucket-level failures are subtracted first. S3 answers several of them
  // with HTTP 404, so without this a typo'd bucket name would be flattened
  // into "object absent" and every download would 404 with nothing logged --
  // exactly the undiagnosable shape this module exists to remove.
  if (err?.name && BUCKET_LEVEL_ERROR_NAMES.has(err.name)) {
    return false;
  }
  return (
    err?.name === 'NoSuchKey' ||
    err?.name === 'NotFound' ||
    // Kept as a fallback because S3-compatible implementations are not
    // consistent about the error *name* they attach to a missing key.
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
 * `getFiles` -> `getFile`; `nextFileName` does not appear in that file). B2
 * returns names in lexicographic order, so a name sorting past that single
 * page is simply not found. Whether the dominant effect is the 1000-name cap
 * or the listing's own lag behind a just-completed write, a keyed GetObject
 * removes both: it never lists.
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
 * Every version id stored under exactly this key, including delete markers.
 *
 * `Prefix` narrows the request to the key and its neighbours, and the exact
 * `Key` match below discards the neighbours; this is not the adapter's
 * scan-the-whole-bucket listing. Pagination is followed to the end on purpose
 * -- an unpaginated listing is the bug this module was written to remove, and
 * reintroducing a cap here would silently leave versions behind.
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
 * Delete an object via the S3 API, erasing every version of it.
 *
 * Two things have to be true at once here. Keyed, for the same reason as the
 * read path: the native adapter's `removeFile` resolves the name through that
 * identical capped listing and, when it cannot find the name, returns
 * `{ value: "ok" }` -- a silent no-op reported as success. Past the cap,
 * deletes stop happening and nothing says so, which is how the test bucket
 * grew unboundedly in the first place.
 *
 * And *erasing*, not hiding. B2 buckets are versioned, so a bare S3
 * `DeleteObject` only writes a hide marker and leaves the payload behind
 * indefinitely, whereas the native `b2_delete_file_version` this replaces
 * removed the bytes. For a product whose users press delete on a shared file
 * and expect it gone, quietly downgrading that to "hidden, pending a lifecycle
 * rule someone remembers to configure" is not an acceptable trade, so the
 * versions are enumerated and removed explicitly.
 *
 * Deleting an absent key still succeeds (no versions to remove, and the
 * unversioned fallback below is itself idempotent); that matches the adapter's
 * documented "no error if the file is not found".
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
    // Listing versions needs a key with list permission. If we do not have it,
    // fall through to the unversioned delete rather than failing the delete
    // outright -- but say so, because that path only hides the object.
    console.error(
      'Could not list versions before deleting; falling back to an ' +
        'unversioned delete, which hides rather than erases. Key:',
      Key,
      error
    );
  }

  if (versionIds.length === 0) {
    // Either the bucket is not versioned, the object is already gone, or the
    // listing above failed. DeleteObject is idempotent in all three cases.
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
