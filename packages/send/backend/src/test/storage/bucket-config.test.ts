import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  StorageAdapterConfig,
  StorageType,
} from '@tweedegolf/storage-abstraction';
import { FileStore } from '../../storage';

/**
 * How a configured backend turns into a signed URL.
 *
 * Presigning is arithmetic over the settings -- no request leaves the process --
 * so the branch production actually runs can be checked without a bucket or a
 * credential. It needs checking: `StorageAdapterConfig` carries an index
 * signature, so a mistyped property name compiles, reads back `undefined`, and
 * ships a backend that signs with no credentials at all.
 */
describe('Storage: bucket configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  const B2: StorageAdapterConfig = {
    type: StorageType.B2,
    bucketName: 'b2-bucket',
    // Backblaze names its S3 credentials `applicationKey*`.
    applicationKeyId: 'b2-key-id',
    applicationKey: 'b2-secret',
    endpoint: 'https://s3.us-west-004.backblazeb2.com',
    region: 'us-west-004',
  };

  const S3: StorageAdapterConfig = {
    type: StorageType.S3,
    bucketName: 's3-bucket',
    accessKeyId: 's3-key-id',
    secretAccessKey: 's3-secret',
    region: 'us-east-1',
  };

  it('signs a Backblaze url with the applicationKey credentials', async () => {
    const url = new URL(
      await new FileStore(B2).getUploadBucketUrl(
        'key',
        'application/octet-stream'
      )
    );

    // Virtual-hosted: production sets no addressing style, so the bucket is a
    // subdomain of the endpoint rather than the first path segment.
    expect(url.host).toBe('b2-bucket.s3.us-west-004.backblazeb2.com');
    expect(url.pathname).toBe('/key');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('b2-key-id');
  });

  it('signs a Backblaze download url the same way', async () => {
    const url = new URL(await new FileStore(B2).getDownloadBucketUrl('key'));

    expect(url.host).toBe('b2-bucket.s3.us-west-004.backblazeb2.com');
    expect(url.pathname).toBe('/key');
  });

  it('resolves an endpoint from the region when none is configured', async () => {
    const url = new URL(await new FileStore(S3).getDownloadBucketUrl('key'));

    expect(url.host).toBe('s3-bucket.s3.us-east-1.amazonaws.com');
  });

  it('signs an S3 url with S3 credentials, never with the B2 ones', async () => {
    // The bug this replaces: the signing client read `B2_*` from the
    // environment, so an `s3` deployment signed urls for the Backblaze bucket
    // while its reads and writes went somewhere else entirely.
    vi.stubEnv('B2_BUCKET_NAME', 'b2-bucket');
    vi.stubEnv('B2_APPLICATION_KEY_ID', 'b2-key-id');

    const url = new URL(await new FileStore(S3).getDownloadBucketUrl('key'));

    expect(url.host).toContain('s3-bucket');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('s3-key-id');
  });

  it('refuses to sign for a backend that has no bucket', async () => {
    const local = new FileStore({ type: StorageType.LOCAL, directory: '/tmp' });

    await expect(local.getDownloadBucketUrl('key')).rejects.toThrow(
      'Bucket storage is not configured'
    );
  });
});
