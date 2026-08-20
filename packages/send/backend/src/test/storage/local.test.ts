import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { afterAll, describe, expect, it } from 'vitest';
import { FileStore, StorageAdapterConfig, StorageType } from '../../storage';

/**
 * The local backend against a temporary directory, so this runs everywhere.
 * src/test/storage/filesystem.test.ts covers the same paths against the
 * directory a developer configured.
 */
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'send-local-'));

const config: StorageAdapterConfig = {
  type: StorageType.LOCAL,
  directory,
  bucketName: 'bucket',
};

const storage = new FileStore(config);

async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function body(contents: string): Readable {
  return Readable.from([Buffer.from(contents, 'utf8')]);
}

describe('Storage: local filesystem', () => {
  afterAll(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('round-trips a file', async () => {
    const key = `${randomUUID()}.txt`;

    expect(await storage.set(key, body('hello') as fs.ReadStream)).toBe(true);
    expect(await storage.length(key)).toBe(5);
    await expect(readAll(await storage.get(key))).resolves.toBe('hello');

    expect(await storage.del(key)).toBe(true);
    expect(await storage.get(key)).toBeNull();
  });

  it('writes keys that contain slashes', async () => {
    const key = `nested/${randomUUID()}.txt`;

    expect(await storage.set(key, body('nested') as fs.ReadStream)).toBe(true);
    await expect(readAll(await storage.get(key))).resolves.toBe('nested');
  });

  it('returns null for a file that does not exist', async () => {
    await expect(storage.get(`${randomUUID()}-absent.txt`)).resolves.toBeNull();
  });

  it('deleting an absent file succeeds', async () => {
    await expect(storage.del(`${randomUUID()}-absent.txt`)).resolves.toBe(true);
  });

  it('refuses a key that escapes the bucket', async () => {
    // Ids reach storage straight from request params.
    expect(
      await storage.set('../escaped.txt', body('x') as fs.ReadStream)
    ).toBe(false);
    await expect(storage.get('../escaped.txt')).rejects.toThrow(
      'outside the bucket'
    );
    expect(fs.existsSync(path.join(directory, 'escaped.txt'))).toBe(false);
  });
});
