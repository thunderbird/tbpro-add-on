/* eslint-disable @typescript-eslint/no-explicit-any */
import { getBlob, sendBlob } from '@send-frontend/lib/filesync';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';

import { Keychain } from '@send-frontend/lib/keychain';
import {
  arrayBufferToReadableStream,
  readableStreamToArrayBuffer,
} from '@send-frontend/lib/streams';

import { encryptStream } from '@send-frontend/lib/ece';
import * as useApiStore from '@send-frontend/stores/api-store';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { mockProgressTracker } from './helpers';

const API_URL = `${import.meta.env.VITE_SEND_SERVER_URL}/api`;
const UPLOAD_ID = `abcdefg1234567`;
const isBucketStorage = true;

// ===================================================
// Setup steps needed at the top-level for `vi.mock()`
const keychain = new Keychain();
const key = await keychain.content.generateKey();

const fileName = 'dummy.txt';
const fileContents = new Array(26)
  .fill(0)
  .map((_, i) => String.fromCharCode(i + 97))
  .join('');
const metadata = { size: fileContents.length, type: 'text/plain' };
const bucketUrl = `${API_URL}/dummybucket`;

const textEncoder = new TextEncoder();
const plaintextUint8Array = textEncoder.encode(fileContents);
const plaintextStream = arrayBufferToReadableStream(plaintextUint8Array);
const encryptedStream = encryptStream(plaintextStream, key);
const encryptedArrayBuffer = await readableStreamToArrayBuffer(encryptedStream);

const { downloadMock } = vi.hoisted(() => {
  return {
    downloadMock: vi.fn(),
  };
});

vi.mock('@send-frontend/lib/helpers', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@send-frontend/lib/utils')>();

  const _download = downloadMock;
  return {
    ...original,
    _download,
  };
});
// ===================================================

describe(`Filesync`, () => {
  const restHandlers = [
    http.get(`${API_URL}/download/check-upload-id/${UPLOAD_ID}`, async () =>
      HttpResponse.json({ isSuspicious: false })
    ),
    http.get(`${API_URL}/uploads/${UPLOAD_ID}/metadata`, async () =>
      HttpResponse.json(metadata)
    ),
    http.get(`${API_URL}/download/${UPLOAD_ID}/signed`, async () =>
      HttpResponse.json({ url: bucketUrl })
    ),
    http.put(`${API_URL}/dummybucket`, async () => HttpResponse.json(metadata)),
    http.post(`${API_URL}/uploads/signed`, async () =>
      HttpResponse.json(metadata)
    ),
  ];

  const server = setupServer(...restHandlers);

  beforeAll(() => {
    server.listen();
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    setActivePinia(createPinia());
    downloadMock.mockClear();
    downloadMock.mockImplementation(({ progressTracker }) => {
      // Simulate the download process
      if (progressTracker) {
        progressTracker.setProgress(100);
      }
      return Promise.resolve(new Blob([encryptedArrayBuffer]));
    });
  });
  afterAll(() => {
    server.close();
  });

  describe(`getBlob`, () => {
    it(`should download and decrypt the upload`, async () => {
      const { api } = useApiStore.default();
      const progress = mockProgressTracker;

      const result = await getBlob(
        UPLOAD_ID,
        metadata.size,
        key,
        isBucketStorage,
        fileName,
        metadata.type,
        api,
        progress
      );
      expect(result).toBe(undefined);

      // Verify the download mock was called
      expect(downloadMock).toHaveBeenCalledTimes(1);
      expect(downloadMock).toHaveBeenCalledWith({
        url: bucketUrl,
        progressTracker: progress,
      });
    });

    it(`should download and decrypt the upload when no key is provided`, async () => {
      const { api } = useApiStore.default();
      const progress = mockProgressTracker;

      const result = await getBlob(
        UPLOAD_ID,
        metadata.size,
        undefined,
        isBucketStorage,
        fileName,
        metadata.type,
        api,
        progress
      );
      expect(result).toBe(undefined);

      // Verify the download mock was called
      expect(downloadMock).toHaveBeenCalledTimes(1);
      expect(downloadMock).toHaveBeenCalledWith({
        url: bucketUrl,
        progressTracker: progress,
      });
    });

    it(`should throw an error if the bucket url is null`, async () => {
      server.use(
        http.get(`${API_URL}/download/${UPLOAD_ID}/signed`, async () =>
          HttpResponse.json({ url: null })
        )
      );
      const { api } = useApiStore.default();
      const progress = mockProgressTracker;

      await expect(
        getBlob(
          UPLOAD_ID,
          metadata.size,
          key,
          isBucketStorage,
          fileName,
          metadata.type,
          api,
          progress
        )
      ).rejects.toThrowError('BUCKET_URL_NOT_FOUND');
    });

    it(`should throw an error if the signed request fails`, async () => {
      server.use(
        http.get(`${API_URL}/download/${UPLOAD_ID}/signed`, async () =>
          HttpResponse.error()
        )
      );
      const { api } = useApiStore.default();
      const progress = mockProgressTracker;

      await expect(
        getBlob(
          UPLOAD_ID,
          metadata.size,
          key,
          isBucketStorage,
          fileName,
          metadata.type,
          api,
          progress
        )
      ).rejects.toThrow();
    });

    it(`should throw an error if the file cannot be downloaded`, async () => {
      // Mock download to reject with an error
      downloadMock.mockImplementation(() => {
        throw new Error('DOWNLOAD ERROR');
      });

      const { api } = useApiStore.default();
      const progress = mockProgressTracker;

      server.use(
        http.get(`${API_URL}/download/${UPLOAD_ID}/signed`, async () =>
          HttpResponse.json({ url: bucketUrl })
        ),
        http.get(bucketUrl, async () => HttpResponse.error())
      );

      await expect(
        getBlob(
          UPLOAD_ID,
          metadata.size,
          key,
          isBucketStorage,
          fileName,
          metadata.type,
          api,
          progress
        )
      ).rejects.toThrowError('DOWNLOAD ERROR');
    });
  });

  describe(`sendBlob`, async () => {
    const SUCCESSFUL_UPLOAD_RESPONSE = {
      id: 1,
    };

    it(`should get a successful response after uploading`, async () => {
      const mockedApi = vi
        .spyOn(useApiStore, 'default')
        // @ts-ignore
        .mockReturnValue({
          // @ts-ignore
          api: { ...useApiStore.default().api },
        })
        .mockResolvedValueOnce({
          // @ts-ignore
          id: 1,
          url: `${API_URL}/dummybucket`,
        });

      const keychain = new Keychain();
      const key = await keychain.content.generateKey();
      const blob = new Blob([new Uint8Array(2)]);

      const result = await sendBlob(
        blob,
        key,
        mockedApi as any,
        mockProgressTracker
      );

      expect(result).toEqual(SUCCESSFUL_UPLOAD_RESPONSE.id);
    });

    it('should handle upload errors', async () => {
      server.use(
        http.put(`${API_URL}/dummybucket`, async () => HttpResponse.error())
      );

      const mockedApi = vi.spyOn(useApiStore, 'default');

      const keychain = new Keychain();
      const key = await keychain.content.generateKey();
      const blob = new Blob([new Uint8Array(2)]);

      await expect(
        sendBlob(
          blob,
          key,
          mockedApi as any,
          mockProgressTracker,
          isBucketStorage
        )
      ).rejects.toThrow();
    });
  });
});
