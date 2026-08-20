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
  // Reads and deletes need the S3 endpoint, so it gates the suite like the
  // keys do. `region` defaults, so it does not.
  endpoint: process.env.TEST_B2_ENDPOINT,
  region: process.env.TEST_B2_REGION || 'auto',
};

/**
 * Every object this suite creates is named under this prefix, so the bucket's
 * lifecycle rule can reap what a crashed run leaves behind (see
 * b2/test-bucket-retention.json) and test objects stay separable from real
 * uploads sharing the bucket.
 */
const TEST_KEY_PREFIX = 'tests/';

/**
 * Vitest's 5s default is not enough for this suite. Every test here makes real
 * round trips to B2, and the delete test makes five of them (write, read, list
 * versions, delete, re-read). Observed suite durations in CI span 1.5-4.8s, so
 * the default sits inside the noise band and fails on a slow one. Raising it
 * weakens nothing: the assertions are unchanged, and a genuinely broken read or
 * delete still fails on the assertion rather than the clock.
 */
const NETWORK_TEST_TIMEOUT_MS = 30_000;

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

    // Unique per object, not per millisecond: this bucket is shared with the
    // e2e workflow and every concurrent CI job.
    const createdKeys: string[] = [];
    const testKey = (label: string) => {
      const key = `${TEST_KEY_PREFIX}${Date.now()}-${randomUUID()}-${label}.txt`;
      createdKeys.push(key);
      return key;
    };

    // The suite used to leak every object it wrote, which is half of how the
    // bucket grew past the native read path's cap.
    afterAll(async () => {
      for (const key of createdKeys) {
        try {
          await storage.del(key);
        } catch (error) {
          console.warn(`Could not clean up test object "${key}"`, error);
        }
      }
    }, NETWORK_TEST_TIMEOUT_MS);

    // Without the S3 endpoint FileStore falls back to the native adapter and
    // every other test here still passes, because this change keeps the bucket
    // small enough for the native listing to work. Assert the mode outright.
    it('runs against the keyed S3 path, not the native listing', () => {
      expect(storage.usesKeyedApi()).toBe(true);
    });

    it(
      'should write a file to b2 bucket',
      async () => {
        const fileName = testKey('write');

        const result = await storage.set(
          fileName,
          fs.createReadStream(mockFilePath)
        );
        expect(result).toBeTruthy();
      },
      NETWORK_TEST_TIMEOUT_MS
    );

    it(
      'should read a file from b2 bucket',
      async () => {
        const fileName = testKey('read');

        const writeResult = await storage.set(
          fileName,
          fs.createReadStream(mockFilePath)
        );
        expect(writeResult).toBeTruthy();

        const readResult = await storage.get(fileName);
        expect(readResult).toBeTruthy();
        // Read the body, not just the handle: a stream of the wrong object, or
        // an empty one, is still a regression.
        await expect(readAll(readResult)).resolves.toBe(mockFileContents);
      },
      NETWORK_TEST_TIMEOUT_MS
    );

    it(
      'should return null for a file that does not exist',
      async () => {
        const fileName = `${TEST_KEY_PREFIX}${randomUUID()}-absent.txt`;

        const readResult = await storage.get(fileName);
        expect(readResult).toBeNull();
      },
      NETWORK_TEST_TIMEOUT_MS
    );

    it(
      'should delete a file from b2 bucket',
      async () => {
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

        // `del` reporting success is not evidence: the native adapter returns
        // "ok" for a key it merely failed to find.
        const afterDelete = await storage.get(fileName);
        expect(afterDelete).toBeNull();
      },
      NETWORK_TEST_TIMEOUT_MS
    );
  }
);
