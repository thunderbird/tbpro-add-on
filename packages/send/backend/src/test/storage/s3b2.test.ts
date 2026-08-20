import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteObject,
  getObjectAsStream,
  isNotFoundError,
  isS3SettingsUsable,
  partSizeFor,
  resolveS3Settings,
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
  it('prefers explicit values over the environment', () => {
    vi.stubEnv('B2_ENDPOINT', 'https://env.example');
    vi.stubEnv('B2_BUCKET_NAME', 'env-bucket');

    const config = resolveS3Settings({
      endpoint: 'https://explicit.example',
      bucketName: 'explicit-bucket',
      accessKeyId: 'key-id',
      secretAccessKey: 'key',
    });

    expect(config.endpoint).toBe('https://explicit.example');
    expect(config.bucketName).toBe('explicit-bucket');
    expect(isS3SettingsUsable(config)).toBe(true);
  });

  it('falls back to the environment when nothing is passed', () => {
    vi.stubEnv('B2_ENDPOINT', 'https://env.example');
    vi.stubEnv('B2_BUCKET_NAME', 'env-bucket');
    vi.stubEnv('B2_APPLICATION_KEY_ID', 'env-key-id');
    vi.stubEnv('B2_APPLICATION_KEY', 'env-key');

    const config = resolveS3Settings();

    expect(config).toMatchObject({
      endpoint: 'https://env.example',
      bucketName: 'env-bucket',
      accessKeyId: 'env-key-id',
      secretAccessKey: 'env-key',
      region: 'auto',
    });
    expect(isS3SettingsUsable(config)).toBe(true);
  });

  it('is not usable when a required value is missing', () => {
    vi.stubEnv('B2_ENDPOINT', '');
    vi.stubEnv('B2_BUCKET_NAME', '');
    vi.stubEnv('B2_APPLICATION_KEY_ID', '');
    vi.stubEnv('B2_APPLICATION_KEY', '');

    expect(
      isS3SettingsUsable(
        resolveS3Settings({
          bucketName: 'bucket',
          accessKeyId: 'key-id',
          secretAccessKey: 'key',
        })
      )
    ).toBe(false);
  });
});

/**
 * A real client so `Upload` finds the config it reads, with the wire stubbed
 * out.
 */
function stubbedClient() {
  const client = new S3Client({
    region: 'auto',
    endpoint: 'https://s3.example',
    credentials: { accessKeyId: 'id', secretAccessKey: 'secret' },
  });
  const sent: Sent[] = [];
  vi.spyOn(client, 'send').mockImplementation((async (command: Sent) => {
    sent.push(command);
    switch (command.constructor.name) {
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
  it('sends a body that fits in one part as a single PutObject', async () => {
    const { client, names } = stubbedClient();

    await uploadObject(client, 'small', Readable.from(['hello']), 'bucket');

    expect(names()).toEqual(['PutObjectCommand']);
  });

  it('splits a larger body into a multipart upload', async () => {
    const { client, sent, names } = stubbedClient();
    const megabyte = Buffer.alloc(1024 * 1024);
    const body = Readable.from(Array.from({ length: 12 }, () => megabyte));

    await uploadObject(client, 'large', body, 'bucket');

    // 12 MiB in 5 MiB parts. Without this the write is one request, and B2
    // rejects a single request past 5 GB -- well under `config.max_file_size`.
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

  it('widens parts rather than exceeding the 10 000-part limit', () => {
    const fiveMiB = 5 * 1024 * 1024;
    expect(partSizeFor()).toBe(fiveMiB);
    expect(partSizeFor(1024)).toBe(fiveMiB);
    // 20 GB, the configured maximum, still fits in default-sized parts.
    expect(partSizeFor(20e9)).toBe(fiveMiB);
    expect(partSizeFor(fiveMiB * 10_000 + 1)).toBeGreaterThan(fiveMiB);
  });
});
