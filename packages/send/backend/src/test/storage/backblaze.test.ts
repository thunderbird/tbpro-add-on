import { describe, expect, it } from 'vitest';

import {
  StorageAdapterConfig,
  StorageType,
} from '@tweedegolf/storage-abstraction';
import fs from 'fs';
import path from 'path';
import { FileStore } from '../../storage';
import { shouldRunSuite } from '../testutils';

const config: StorageAdapterConfig = {
  type: StorageType.B2,
  bucketName: process.env.TEST_B2_BUCKET_NAME,
  applicationKeyId: process.env.TEST_B2_APPLICATION_KEY_ID,
  applicationKey: process.env.TEST_B2_APPLICATION_KEY,
};

describe.runIf(shouldRunSuite(config, `Storage: Backblaze B2`))(
  `Storage: Backblaze B2`,
  () => {
    const mockFile = 'file.txt';
    const mockDataDir = path.join(__dirname, 'data/');
    const mockFilePath = path.join(mockDataDir, mockFile);

    const storage = new FileStore(config);

    // Backblaze B2's native API is not immediately read-after-write consistent:
    // a file written via `storage.set()` can briefly read back as null right
    // after the write. (The same lag is documented in src/storage/index.ts for
    // `length()`.) These tests are the only real backend-tests failures in CI,
    // and they fail intermittently for this reason, not because of app code.
    // Retry the read a few times so the assertion reflects B2's actual state
    // once it has settled.
    const readWithRetry = async (fileName: string, attempts = 5) => {
      for (let i = 0; i < attempts; i++) {
        const result = await storage.get(fileName);
        if (result) return result;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return storage.get(fileName);
    };

    it('should write a file to b2 bucket', async () => {
      const fileName = `${new Date().getTime()}-write.txt`;

      const result = await storage.set(
        fileName,
        fs.createReadStream(mockFilePath)
      );
      expect(result).toBeTruthy();
    });

    it('should read a file from b2 bucket', async () => {
      const fileName = `${new Date().getTime()}-read.txt`;

      const writeResult = await storage.set(
        fileName,
        fs.createReadStream(mockFilePath)
      );
      expect(writeResult).toBeTruthy();

      const readResult = await readWithRetry(fileName);
      expect(readResult).toBeTruthy();
    });

    it('should delete a file from b2 bucket', async () => {
      const fileName = `${new Date().getTime()}-delete.txt`;

      const writeResult = await storage.set(
        fileName,
        fs.createReadStream(mockFilePath)
      );
      expect(writeResult).toBeTruthy();

      const readResult = await readWithRetry(fileName);
      expect(readResult).toBeTruthy();

      const deleteResult = await storage.del(fileName);
      expect(deleteResult).toBeTruthy();
    });
  }
);
