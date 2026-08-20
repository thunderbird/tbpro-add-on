import { afterAll, describe, expect, it } from 'vitest';

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { FileStore, StorageAdapterConfig, StorageType } from '../../storage';
import { NETWORK_TEST_TIMEOUT_MS, shouldRunSuite } from '../testutils';

const config: StorageAdapterConfig = {
  type: StorageType.S3,
  region: process.env.TEST_S3_REGION || 'auto',
  bucketName: process.env.TEST_S3_BUCKET_NAME,
  endpoint: process.env.TEST_S3_ENDPOINT,
  accessKeyId: process.env.TEST_S3_ACCESS_KEY,
  secretAccessKey: process.env.TEST_S3_SECRET_KEY,
};

describe.runIf(shouldRunSuite(config, 'Storage: S3-compatible'))(
  `Storage: S3-compatible`,
  () => {
    const mockFile = 'file.txt';
    const mockDataDir = path.join(__dirname, 'data/');
    const mockFilePath = path.join(mockDataDir, mockFile);

    const storage = new FileStore(config);

    const createdKeys: string[] = [];
    const testKey = (label: string) => {
      const key = `${label}-${randomUUID()}.txt`;
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

    it('has a usable S3 client for the configured bucket', () => {
      expect(storage.usesKeyedApi()).toBe(true);
    });

    it(
      'should write a file to s3 bucket',
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
      'should read a file from s3 bucket',
      async () => {
        const fileName = testKey('read');

        const writeResult = await storage.set(
          fileName,
          fs.createReadStream(mockFilePath)
        );
        expect(writeResult).toBeTruthy();

        const readResult = await storage.get(fileName);
        expect(readResult).toBeTruthy();
        readResult.destroy();
      },
      NETWORK_TEST_TIMEOUT_MS
    );

    it(
      'should delete a file from s3 bucket',
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
      },
      NETWORK_TEST_TIMEOUT_MS
    );
  }
);
