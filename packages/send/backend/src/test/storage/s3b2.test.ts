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

  it('classifies errors by name or by status code', () => {
    expect(isNotFoundError(awsError('NoSuchKey', 404))).toBe(true);
    expect(isNotFoundError(awsError('NotFound', 404))).toBe(true);
    expect(isNotFoundError(awsError('SomethingElse', 404))).toBe(true);
    expect(isNotFoundError(awsError('AccessDenied', 403))).toBe(false);
    expect(isNotFoundError(new Error('socket hang up'))).toBe(false);
  });
});

describe('storage/s3b2: keyed deletes', () => {
  it('issues a DeleteObject for the requested key', async () => {
    const { client, send } = fakeClient(() => ({}));

    await deleteObject(client, 'some-key', 'some-bucket');

    const command = send.mock.calls[0][0] as Sent;
    expect(command.constructor.name).toBe('DeleteObjectCommand');
    expect(command.input).toMatchObject({
      Bucket: 'some-bucket',
      Key: 'some-key',
    });
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
