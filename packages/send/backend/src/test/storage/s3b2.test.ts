import { S3Client } from '@aws-sdk/client-s3';
import { Readable, Transform } from 'stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileStore, StorageType } from '../../storage';
import {
  deleteObject,
  getObjectAsStream,
  isNotFoundError,
  isS3SettingsUsable,
  partSizeFor,
  uploadObject,
} from '../../storage/s3b2';

/**
 * No credentials needed: these pin the S3 plane's behaviour, so the live
 * bucket suites -- skipped without credentials -- are not the only thing
 * guarding it.
 */

type Sent = { constructor: { name: string }; input: Record<string, unknown> };

function fakeClient(handler: (command: Sent) => unknown) {
  const send = vi.fn(async (command: Sent) => handler(command));
  return { client: { send } as unknown as S3Client, send };
}

function awsError(name: string, httpStatusCode: number) {
  const error = new Error(name);
  error.name = name;
  (error as Error & { $metadata: unknown }).$metadata = { httpStatusCode };
  return error;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('storage/s3b2: keyed reads', () => {
  it('issues a single GetObject for the requested key', async () => {
    const { client, send } = fakeClient(() => ({
      Body: Readable.from(['hello']),
    }));

    const stream = await getObjectAsStream(client, 'some-key', 'some-bucket');

    expect(stream).toBeTruthy();
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as Sent;
    expect(command.constructor.name).toBe('GetObjectCommand');
    expect(command.input).toMatchObject({
      Bucket: 'some-bucket',
      Key: 'some-key',
    });
  });

  it('returns null when the object does not exist', async () => {
    const { client } = fakeClient(() => {
      throw awsError('NoSuchKey', 404);
    });

    await expect(
      getObjectAsStream(client, 'missing', 'some-bucket')
    ).resolves.toBeNull();
  });

  it('surfaces failures that are not "object absent"', async () => {
    const { client } = fakeClient(() => {
      throw awsError('AccessDenied', 403);
    });

    // A credential, endpoint or bucket-policy regression must not be flattened
    // into a null that reads as "the file simply is not there".
    await expect(
      getObjectAsStream(client, 'forbidden', 'some-bucket')
    ).rejects.toThrow('AccessDenied');
  });

  it('does not mistake a missing bucket for a missing object', async () => {
    const { client } = fakeClient(() => {
      throw awsError('NoSuchBucket', 404);
    });

    // S3 answers this with a 404 too. Reading it as "absent" would turn a
    // misconfigured bucket name into a silent, total download outage.
    await expect(
      getObjectAsStream(client, 'some-key', 'wrong-bucket')
    ).rejects.toThrow('NoSuchBucket');
  });

  it('classifies errors by name or by status code', () => {
    expect(isNotFoundError(awsError('NoSuchKey', 404))).toBe(true);
    expect(isNotFoundError(awsError('NotFound', 404))).toBe(true);
    expect(isNotFoundError(awsError('SomethingElse', 404))).toBe(true);
    expect(isNotFoundError(awsError('AccessDenied', 403))).toBe(false);
    expect(isNotFoundError(new Error('socket hang up'))).toBe(false);
    // Bucket-level failures are not "object absent", whatever their status.
    expect(isNotFoundError(awsError('NoSuchBucket', 404))).toBe(false);
    expect(isNotFoundError(awsError('InvalidBucketName', 404))).toBe(false);
    expect(isNotFoundError(awsError('PermanentRedirect', 404))).toBe(false);
  });
});

describe('storage/s3b2: keyed deletes', () => {
  it('erases every version of the key, and only that key', async () => {
    const { client, send } = fakeClient((command) => {
      if (command.constructor.name === 'ListObjectVersionsCommand') {
        return {
          Versions: [
            { Key: 'some-key', VersionId: 'v1' },
            // A neighbour sharing the prefix. Deleting this would destroy an
            // unrelated user's file.
            { Key: 'some-key-2', VersionId: 'other' },
          ],
          DeleteMarkers: [{ Key: 'some-key', VersionId: 'marker' }],
        };
      }
      return {};
    });

    await deleteObject(client, 'some-key', 'some-bucket');

    const listed = send.mock.calls[0][0] as Sent;
    expect(listed.constructor.name).toBe('ListObjectVersionsCommand');
    expect(listed.input).toMatchObject({
      Bucket: 'some-bucket',
      Prefix: 'some-key',
    });

    const deletes = send.mock.calls
      .slice(1)
      .map((call) => (call[0] as Sent).input);
    // B2 buckets are versioned: a bare DeleteObject only hides the object.
    // Each version is removed by id so the bytes actually go.
    expect(deletes).toEqual([
      { Bucket: 'some-bucket', Key: 'some-key', VersionId: 'v1' },
      { Bucket: 'some-bucket', Key: 'some-key', VersionId: 'marker' },
    ]);
  });

  it('follows pagination rather than stopping at the first page', async () => {
    let page = 0;
    const { client, send } = fakeClient((command) => {
      if (command.constructor.name === 'ListObjectVersionsCommand') {
        page += 1;
        if (page === 1) {
          return {
            Versions: [{ Key: 'some-key', VersionId: 'v1' }],
            IsTruncated: true,
            NextKeyMarker: 'some-key',
            NextVersionIdMarker: 'v1',
          };
        }
        return { Versions: [{ Key: 'some-key', VersionId: 'v2' }] };
      }
      return {};
    });

    await deleteObject(client, 'some-key', 'some-bucket');

    // A cap here would strand versions.
    expect(page).toBe(2);
    const versionIds = send.mock.calls
      .filter(
        (call) => (call[0] as Sent).constructor.name === 'DeleteObjectCommand'
      )
      .map((call) => (call[0] as Sent).input.VersionId);
    expect(versionIds).toEqual(['v1', 'v2']);
  });

  it('falls back to an unversioned delete when nothing is listed', async () => {
    const { client, send } = fakeClient((command) => {
      if (command.constructor.name === 'ListObjectVersionsCommand') {
        return { Versions: [] };
      }
      return {};
    });

    // Unversioned bucket, or an object that is already gone. DeleteObject is
    // idempotent, so this must still succeed rather than throw.
    await deleteObject(client, 'some-key', 'some-bucket');

    const command = send.mock.calls[1][0] as Sent;
    expect(command.constructor.name).toBe('DeleteObjectCommand');
    expect(command.input).toEqual({
      Bucket: 'some-bucket',
      Key: 'some-key',
    });
  });

  it('still deletes when listing versions is not permitted', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { client, send } = fakeClient((command) => {
      if (command.constructor.name === 'ListObjectVersionsCommand') {
        throw awsError('AccessDenied', 403);
      }
      return {};
    });

    await deleteObject(client, 'some-key', 'some-bucket');

    // Degrades to hiding rather than failing outright -- but says so: the
    // object is then retained until a lifecycle rule reaps it.
    const command = send.mock.calls[1][0] as Sent;
    expect(command.constructor.name).toBe('DeleteObjectCommand');
    expect(command.input).toEqual({
      Bucket: 'some-bucket',
      Key: 'some-key',
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('storage/s3b2: configuration', () => {
  const complete = {
    endpoint: 'https://explicit.example',
    region: 'auto',
    accessKeyId: 'key-id',
    secretAccessKey: 'key',
    bucketName: 'explicit-bucket',
  };

  it('needs a bucket and credentials', () => {
    expect(isS3SettingsUsable(complete)).toBe(true);
    expect(isS3SettingsUsable({ ...complete, bucketName: '' })).toBe(false);
    expect(isS3SettingsUsable({ ...complete, accessKeyId: '' })).toBe(false);
    expect(isS3SettingsUsable({ ...complete, secretAccessKey: '' })).toBe(
      false
    );
  });

  it('needs an endpoint for B2, but only an endpoint or region otherwise', () => {
    const noEndpoint = { ...complete, endpoint: '', region: 'us-east-1' };
    expect(isS3SettingsUsable(noEndpoint)).toBe(true);
    expect(isS3SettingsUsable(noEndpoint, { needsEndpoint: true })).toBe(false);
    expect(isS3SettingsUsable({ ...noEndpoint, region: '' })).toBe(false);
  });

  it('does not resolve an S3 backend onto the B2 bucket', () => {
    vi.stubEnv('STORAGE_BACKEND', 's3');
    vi.stubEnv('B2_ENDPOINT', 'https://b2.example');
    vi.stubEnv('B2_APPLICATION_KEY_ID', 'b2-key-id');
    vi.stubEnv('B2_APPLICATION_KEY', 'b2-key');
    vi.stubEnv('B2_BUCKET_NAME', 'b2-bucket');
    vi.stubEnv('S3_BUCKET_NAME', '');
    vi.stubEnv('S3_ENDPOINT', '');
    vi.stubEnv('S3_ACCESS_KEY', '');
    vi.stubEnv('S3_SECRET_KEY', '');
    vi.stubEnv('S3_REGION', '');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // Borrowing the other backend's values would report healthy while writing
    // user files into a bucket nobody selected.
    expect(new FileStore().usesKeyedApi()).toBe(false);

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('refuses an unrecognised backend rather than falling back to disk', () => {
    expect(
      () => new FileStore({ type: 'gcs' as StorageType, bucketName: 'b' })
    ).toThrow('Unknown storage backend');
  });
});

/**
 * A real client so `Upload` finds the config it reads, with the wire stubbed
 * out.
 */
function stubbedClient(
  overrides: Record<string, (command: Sent) => unknown> = {}
) {
  const client = new S3Client({
    region: 'auto',
    endpoint: 'https://s3.example',
    credentials: { accessKeyId: 'id', secretAccessKey: 'secret' },
  });
  const sent: Sent[] = [];
  vi.spyOn(client, 'send').mockImplementation((async (command: Sent) => {
    sent.push(command);
    const name = command.constructor.name;
    if (overrides[name]) {
      return overrides[name](command);
    }
    switch (name) {
      case 'CreateMultipartUploadCommand':
        return { UploadId: 'upload-id' };
      case 'UploadPartCommand':
        return { ETag: `etag-${command.input.PartNumber}` };
      default:
        return {};
    }
  }) as never);
  return { client, sent, names: () => sent.map((c) => c.constructor.name) };
}

describe('storage/s3b2: writes', () => {
  const megabyte = Buffer.alloc(1024 * 1024);
  const twelveMiB = () =>
    Readable.from(Array.from({ length: 12 }, () => megabyte));

  it('sends a body that fits in one part as a single PutObject', async () => {
    const { client, names } = stubbedClient();

    await uploadObject(client, 'small', Readable.from(['hello']), 'bucket');

    expect(names()).toEqual(['PutObjectCommand']);
  });

  it('splits a larger body into a multipart upload', async () => {
    const { client, sent, names } = stubbedClient();

    await uploadObject(client, 'large', twelveMiB(), 'bucket');

    // 12 MiB in 5 MiB parts.
    expect(names()).toEqual([
      'CreateMultipartUploadCommand',
      'UploadPartCommand',
      'UploadPartCommand',
      'UploadPartCommand',
      'CompleteMultipartUploadCommand',
    ]);
    const complete = sent[sent.length - 1];
    expect(complete.input).toMatchObject({ Bucket: 'bucket', Key: 'large' });
  });

  it('uploads a body that carries a numeric `length`', async () => {
    const { client, names } = stubbedClient();
    // The shape the sole production caller supplies: `Limiter` in
    // src/wsUploadHandler.ts is a Transform with a byte counter on it. Read as
    // a content length, it would fix the expected part count at zero.
    const counter = new Transform({
      transform(chunk, encoding, callback) {
        (this as unknown as { length: number }).length += chunk.length;
        callback(null, chunk);
      },
    });
    (counter as unknown as { length: number }).length = 0;
    twelveMiB().pipe(counter);

    await uploadObject(client, 'counted', counter, 'bucket');

    expect(names()[names().length - 1]).toBe('CompleteMultipartUploadCommand');
  });

  it('sizes parts from the declared size', async () => {
    const { client, sent } = stubbedClient();

    // Widens the parts to 7 MiB, so a 12 MiB body is two of them, not three.
    await uploadObject(
      client,
      'sized',
      twelveMiB(),
      'bucket',
      7 * 1024 * 1024 * 10_000
    );

    const parts = sent.filter(
      (command) => command.constructor.name === 'UploadPartCommand'
    );
    expect(parts).toHaveLength(2);
  });

  it('aborts the multipart upload when a part fails', async () => {
    const { client, names } = stubbedClient({
      UploadPartCommand: () => {
        throw new Error('part rejected');
      },
    });

    // Otherwise the parts already written stay in the bucket, billed, until a
    // lifecycle rule reaps them.
    await expect(
      uploadObject(client, 'doomed', twelveMiB(), 'bucket')
    ).rejects.toThrow('part rejected');
    expect(names()).toContain('AbortMultipartUploadCommand');
  });

  it('clamps the part size against a declared size it cannot trust', () => {
    const fiveMiB = 5 * 1024 * 1024;
    const thirtyTwoMiB = 32 * 1024 * 1024;
    expect(partSizeFor()).toBe(fiveMiB);
    expect(partSizeFor(1024)).toBe(fiveMiB);
    // 20 GB, the configured maximum, still fits in default-sized parts.
    expect(partSizeFor(20e9)).toBe(fiveMiB);
    expect(partSizeFor(fiveMiB * 10_000 + 1)).toBeGreaterThan(fiveMiB);
    // `size` arrives unvalidated from the client, and each part is held whole
    // in memory.
    expect(partSizeFor(1e15)).toBe(thirtyTwoMiB);
    expect(partSizeFor(Number.MAX_SAFE_INTEGER)).toBe(thirtyTwoMiB);
    expect(partSizeFor(-1)).toBe(fiveMiB);
    expect(partSizeFor(Number.NaN)).toBe(fiveMiB);
    expect(partSizeFor('abc' as unknown as number)).toBe(fiveMiB);
  });
});

describe('storage/s3b2: presigned urls', () => {
  const b2 = {
    type: StorageType.B2,
    bucketName: 'b2-bucket',
    applicationKeyId: 'b2-key-id',
    applicationKey: 'b2-key',
    endpoint: 'https://s3.eu-central-003.example',
    region: 'eu-central-003',
  };

  it('signs uploads and downloads against the configured bucket', async () => {
    const storage = new FileStore(b2);

    const upload = new URL(
      await storage.getUploadBucketUrl('some-key', 'application/octet-stream')
    );
    const download = new URL(await storage.getDownloadBucketUrl('some-key'));

    for (const url of [upload, download]) {
      expect(url.host).toBe('b2-bucket.s3.eu-central-003.example');
      expect(url.pathname).toBe('/some-key');
      expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
      expect(url.searchParams.get('X-Amz-Credential')).toContain('b2-key-id');
    }
  });

  it('signs an S3 backend with its own settings', async () => {
    vi.stubEnv('B2_BUCKET_NAME', 'b2-bucket');
    vi.stubEnv('B2_ENDPOINT', 'https://s3.eu-central-003.example');

    const storage = new FileStore({
      type: StorageType.S3,
      bucketName: 's3-bucket',
      accessKeyId: 's3-key-id',
      secretAccessKey: 's3-key',
      region: 'us-east-1',
    });

    const url = new URL(await storage.getDownloadBucketUrl('some-key'));
    expect(url.host).toBe('s3-bucket.s3.us-east-1.amazonaws.com');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('s3-key-id');
  });

  it('refuses to sign when the bucket is not configured', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const storage = new FileStore({ ...b2, endpoint: '' });

    await expect(storage.getDownloadBucketUrl('some-key')).rejects.toThrow(
      'Bucket storage is not configured'
    );
    consoleError.mockRestore();
  });
});
