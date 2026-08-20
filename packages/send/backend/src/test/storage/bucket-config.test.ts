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
  // Only the STORAGE_BACKEND cases below stub the environment; every other test
  // builds its FileStore from an explicit config. Restore anyway, so a stub
  // cannot leak into a suite that reads the real value.
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
    // while its reads and writes went somewhere else entirely. The host
    // assertion below is the guard -- it fails for any signing client built
    // from `B2_*` rather than from this store's own config (#1143). Stubbing
    // the environment would not help: the old code read it at module scope,
    // before any stub could run.
    const url = new URL(await new FileStore(S3).getDownloadBucketUrl('key'));

    expect(url.host).toContain('s3-bucket');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('s3-key-id');
  });

  it('refuses to sign for a backend that has no bucket', async () => {
    const bucketless = new FileStore({ ...S3, bucketName: undefined });

    await expect(bucketless.getDownloadBucketUrl('key')).rejects.toThrow(
      'Bucket storage is not configured'
    );
  });

  // There used to be a filesystem backend, and it was the `default:` case, so a
  // typo'd or unset STORAGE_BACKEND silently produced a store that could not
  // serve an upload. Booting is the last moment that is cheap to notice.
  it.each([
    // `undefined` deletes the variable: "the operator never set it" is the
    // realistic failure, and it is a different branch from the empty string.
    ['unset', undefined, ''],
    ['empty', '', ''],
    ['the removed filesystem backend', 'fs', 'fs'],
    ['a typo', 'typo', 'typo'],
  ])('refuses to start with STORAGE_BACKEND %s', (_label, value, reported) => {
    vi.stubEnv('STORAGE_BACKEND', value);

    expect(() => new FileStore()).toThrow(
      `STORAGE_BACKEND must be 'b2' or 's3', got '${reported}'`
    );
  });

  it('signs with the public endpoint when the browser reaches another host', async () => {
    // The compose case: the backend talks to `minio:9000` over the container
    // network, which the browser cannot resolve.
    const url = new URL(
      await new FileStore({
        ...S3,
        endpoint: 'http://minio:9000',
        publicEndpoint: 'http://localhost:9000',
        forcePathStyle: true,
      }).getDownloadBucketUrl('key')
    );

    expect(url.host).toBe('localhost:9000');
    expect(url.pathname).toBe('/s3-bucket/key');
  });
});
