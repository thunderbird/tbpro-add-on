import type { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteObject,
  getObjectAsStream,
  isDirectConfigUsable,
  isNotFoundError,
  resolveDirectConfig,
} from '../../storage/s3b2';

/**
 * These tests need no Backblaze credentials: they pin the *semantics* of the
 * keyed read/delete path -- which errors mean "absent" and which must surface
 * -- so that the live B2 suite (which does need credentials, and is skipped
 * without them) is not the only thing standing between us and a silent
 * regression here.
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

    // S3 answers this with a 404 too. Reading it as "the object is absent"
    // would turn a misconfigured bucket name into a silent, total download
    // outage: every file 404s, nothing is logged, and the live B2 suite fails
    // with the same "expected null to be truthy" this change set out to fix.
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
    // B2 buckets are versioned: a bare DeleteObject only hides the object and
    // leaves the bytes. Users pressing "delete" on a shared file expect them
    // gone, so each version is removed by id.
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

    // An unpaginated listing is the whole bug this module removes; leaving a
    // cap here would quietly strand versions instead of objects.
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

    // Degrades to hiding rather than failing the delete outright -- but says
    // so, because the object is then retained until a lifecycle rule reaps it.
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

    const config = resolveDirectConfig({
      endpoint: 'https://explicit.example',
      bucketName: 'explicit-bucket',
      accessKeyId: 'key-id',
      secretAccessKey: 'key',
    });

    expect(config.endpoint).toBe('https://explicit.example');
    expect(config.bucketName).toBe('explicit-bucket');
    expect(isDirectConfigUsable(config)).toBe(true);
  });

  it('falls back to the environment when nothing is passed', () => {
    vi.stubEnv('B2_ENDPOINT', 'https://env.example');
    vi.stubEnv('B2_BUCKET_NAME', 'env-bucket');
    vi.stubEnv('B2_APPLICATION_KEY_ID', 'env-key-id');
    vi.stubEnv('B2_APPLICATION_KEY', 'env-key');

    const config = resolveDirectConfig();

    expect(config).toMatchObject({
      endpoint: 'https://env.example',
      bucketName: 'env-bucket',
      accessKeyId: 'env-key-id',
      secretAccessKey: 'env-key',
      region: 'auto',
    });
    expect(isDirectConfigUsable(config)).toBe(true);
  });

  it('is not usable when a required value is missing', () => {
    vi.stubEnv('B2_ENDPOINT', '');
    vi.stubEnv('B2_BUCKET_NAME', '');
    vi.stubEnv('B2_APPLICATION_KEY_ID', '');
    vi.stubEnv('B2_APPLICATION_KEY', '');

    expect(
      isDirectConfigUsable(
        resolveDirectConfig({
          bucketName: 'bucket',
          accessKeyId: 'key-id',
          secretAccessKey: 'key',
        })
      )
    ).toBe(false);
  });
});
