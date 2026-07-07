import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getSignedUrlCommand } from '@aws-sdk/s3-request-presigner';

const Bucket = process.env.B2_BUCKET_NAME;

export async function getClientFromAWSSDK() {
  // Configure the S3 client
  const s3Client = new S3Client({
    endpoint: `${process.env.B2_ENDPOINT}`,
    region: process.env.B2_REGION || 'auto',
    credentials: {
      accessKeyId: process.env.B2_APPLICATION_KEY_ID,
      secretAccessKey: process.env.B2_APPLICATION_KEY,
    },
    requestHandler: { requestTimeout: 30000 },
    maxAttempts: 3,
  });

  return s3Client;
}

export async function getSignedUrl(
  s3Client: S3Client,
  Key: string,
  ContentType: string
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
  Key: string
): Promise<number> {
  const command = new HeadObjectCommand({
    Bucket,
    Key,
  });
  const response = await s3Client.send(command);
  return response.ContentLength ?? 0;
}

export async function getSignedUrlforDownload(s3Client: S3Client, Key: string) {
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
