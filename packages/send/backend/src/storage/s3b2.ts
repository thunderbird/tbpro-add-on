import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getSignedUrlCommand } from '@aws-sdk/s3-request-presigner';

/**
 * The S3 data plane, used for presigned URLs and keyed size reads.
 *
 * Backblaze B2 and Amazon S3 both speak it, so the connection details are a
 * parameter rather than a module-level read of `B2_*`: an `s3` deployment must
 * not sign URLs for the B2 bucket while its reads and writes go elsewhere.
 */
export type S3Settings = {
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  /**
   * Address the bucket as `<endpoint>/<bucket>/<key>` instead of
   * `<bucket>.<endpoint>/<key>`. Needed for an S3 implementation reached at a
   * bare host:port, such as MinIO. Production buckets leave this unset and keep
   * the SDK's virtual-hosted default.
   */
  forcePathStyle?: boolean;
};

export function createS3Client(settings: S3Settings): S3Client {
  return new S3Client({
    // Undefined is the SDK's "resolve an endpoint from the region" signal, which
    // is what Amazon S3 wants; Backblaze and MinIO are only reachable at one
    // they are told.
    endpoint: settings.endpoint,
    forcePathStyle: settings.forcePathStyle,
    // Required by the SDK even when the endpoint decides where requests go.
    region: settings.region || 'auto',
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
    requestHandler: { requestTimeout: 30000 },
    maxAttempts: 3,
  });
}

export async function getSignedUrl(
  s3Client: S3Client,
  {
    Bucket,
    Key,
    ContentType,
  }: { Bucket: string; Key: string; ContentType: string }
) {
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
  { Bucket, Key }: { Bucket: string; Key: string }
): Promise<number> {
  const command = new HeadObjectCommand({
    Bucket,
    Key,
  });
  const response = await s3Client.send(command);
  return response.ContentLength ?? 0;
}

export async function getSignedUrlforDownload(
  s3Client: S3Client,
  { Bucket, Key }: { Bucket: string; Key: string }
) {
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
