import { afterAll, describe, expect, it } from 'vitest';

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { FileStore, StorageAdapterConfig, StorageType } from '../../storage';
import { NETWORK_TEST_TIMEOUT_MS, shouldRunSuite } from '../testutils';

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

    afterAll(async () => {
      for (const key of createdKeys) {
        try {
          await storage.del(key);
        } catch (error) {
          console.warn(`Could not clean up test object "${key}"`, error);
        }
      }
    }, NETWORK_TEST_TIMEOUT_MS);

    // In CI `shouldRunSuite` runs this suite unconditionally, so a bucket
    // credential that went missing would otherwise surface as a pile of
    // confusing failures rather than one legible one.
    it('has a usable S3 client for the configured bucket', () => {
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
      'should write a file larger than one multipart part',
      async () => {
        const fileName = testKey('multipart');
        // Past the 5 MiB minimum part size, so this is the only test that
        // proves B2 accepts CreateMultipartUpload/UploadPart/Complete -- and
        // the checksum headers the SDK sends with them.
        const size = 6 * 1024 * 1024;

        const result = await storage.set(
          fileName,
          Readable.from([Buffer.alloc(size)]) as fs.ReadStream,
          size
        );
        expect(result).toBe(true);
        await expect(storage.length(fileName)).resolves.toBe(size);
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

        // `del` reporting success is not evidence that anything went: a
        // versioned bucket answers a plain delete by hiding the object.
        const afterDelete = await storage.get(fileName);
        expect(afterDelete).toBeNull();
      },
      NETWORK_TEST_TIMEOUT_MS
    );
  }
);
