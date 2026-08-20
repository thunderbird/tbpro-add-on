import { afterAll, describe, expect, it } from 'vitest';

import {
  StorageAdapterConfig,
  StorageType,
} from '@tweedegolf/storage-abstraction';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { FileStore } from '../../storage';
import { shouldRunSuite } from '../testutils';

const config: StorageAdapterConfig = {
  type: StorageType.B2,
  bucketName: process.env.TEST_B2_BUCKET_NAME,
  applicationKeyId: process.env.TEST_B2_APPLICATION_KEY_ID,
  applicationKey: process.env.TEST_B2_APPLICATION_KEY,
  // Reads and deletes go through Backblaze's S3-compatible API (see
  // src/storage/s3b2.ts), so the endpoint is as much a requirement for this
  // suite as the keys are. `region` defaults, so it is not part of the gate.
  endpoint: process.env.TEST_B2_ENDPOINT,
  region: process.env.TEST_B2_REGION || 'auto',
};

/**
 * Every object this suite creates is named under this prefix so that (a) the
 * bucket's lifecycle rule can reap anything a crashed run leaves behind -- see
 * b2/test-bucket-retention.json -- and (b) test objects are greppable and
 * separable from real uploads sharing the bucket.
 */
const TEST_KEY_PREFIX = 'tests/';

async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

describe.runIf(shouldRunSuite(config, `Storage: Backblaze B2`))(
  `Storage: Backblaze B2`,
  () => {
    const mockFile = 'file.txt';
    const mockDataDir = path.join(__dirname, 'data/');
    const mockFilePath = path.join(mockDataDir, mockFile);
    const mockFileContents = fs.readFileSync(mockFilePath, 'utf8');

    const storage = new FileStore(config);

    // Keys are unique per object rather than per millisecond: this bucket is
    // shared with the e2e workflow and with every concurrent CI job.
    const createdKeys: string[] = [];
    const testKey = (label: string) => {
      const key = `${TEST_KEY_PREFIX}${Date.now()}-${randomUUID()}-${label}.txt`;
      createdKeys.push(key);
      return key;
    };

    // The suite used to leak every object it wrote. Combined with a delete path
    // that silently no-opped, that is what filled the bucket past the point
    // where the native read path could find anything.
    afterAll(async () => {
      for (const key of createdKeys) {
        try {
          await storage.del(key);
        } catch (error) {
          console.warn(`Could not clean up test object "${key}"`, error);
        }
      }
    });

    // If the S3 endpoint is missing, `FileStore` falls back to the native
    // adapter and every other test here still passes -- absent keys read null
    // and deleted keys read null on both paths, and the bucket is now kept
    // small enough for the native listing to find things. So assert the mode
    // outright: this suite exists to cover the keyed S3 path.
    it('runs against the keyed S3 path, not the native listing', () => {
      expect(storage.usesKeyedApi()).toBe(true);
    });

    it('should write a file to b2 bucket', async () => {
      const fileName = testKey('write');

      const result = await storage.set(
        fileName,
        fs.createReadStream(mockFilePath)
      );
      expect(result).toBeTruthy();
    });

    it('should read a file from b2 bucket', async () => {
      const fileName = testKey('read');

      const writeResult = await storage.set(
        fileName,
        fs.createReadStream(mockFilePath)
      );
      expect(writeResult).toBeTruthy();

      const readResult = await storage.get(fileName);
      expect(readResult).toBeTruthy();
      // Read the body back, not just the handle: a read path that returns a
      // stream of the wrong object, or an empty one, is still a regression.
      await expect(readAll(readResult)).resolves.toBe(mockFileContents);
    });

    it('should return null for a file that does not exist', async () => {
      const fileName = `${TEST_KEY_PREFIX}${randomUUID()}-absent.txt`;

      const readResult = await storage.get(fileName);
      expect(readResult).toBeNull();
    });

    it('should delete a file from b2 bucket', async () => {
      const fileName = testKey('delete');

      const writeResult = await storage.set(
        fileName,
        fs.createReadStream(mockFilePath)
      );
      expect(writeResult).toBeTruthy();

      const readResult = await storage.get(fileName);
      expect(readResult).toBeTruthy();
      readResult.destroy();

      const deleteResult = await storage.del(fileName);
      expect(deleteResult).toBeTruthy();

      // `del` reporting success is not evidence that anything was deleted --
      // the native adapter returns "ok" for a key it merely failed to find.
      // Prove the object is actually gone.
      const afterDelete = await storage.get(fileName);
      expect(afterDelete).toBeNull();
    });
  }
);
