import { ProgressTracker } from '@send-frontend/apps/send/stores/status-store';
import { ApiConnection } from '@send-frontend/lib/api';
import { MAX_CONCURRENT_PARTS, SPLIT_SIZE } from '@send-frontend/lib/const';
import { NamedBlob, sendBlob } from '@send-frontend/lib/filesync';
import { Keychain } from '@send-frontend/lib/keychain';
import Uploader from '@send-frontend/lib/upload';
import { hashFiles, splitIntoMultipleZips } from '@send-frontend/lib/utils';
import { UserType } from '@send-frontend/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@send-frontend/lib/filesync', () => ({
  sendBlob: vi.fn().mockResolvedValue('upload-id'),
}));

vi.mock('@send-frontend/lib/utils', () => ({
  splitIntoMultipleZips: vi
    .fn()
    .mockResolvedValue([
      Object.assign(new Blob(['part1']), { name: 'large-file.txt' }),
      Object.assign(new Blob(['part2']), { name: 'large-file.txt' }),
    ]),
  retryUntilSuccessOrTimeout: vi.fn().mockResolvedValue(undefined),
  generateFileHash: vi.fn().mockResolvedValue('abc123def456'),
  hashFiles: vi.fn().mockResolvedValue(['abc123def456']),
}));

describe('Uploader', () => {
  let uploader: Uploader;
  let mockUser: UserType;
  let mockKeychain: Keychain;
  let mockApi: ApiConnection;
  let mockProgressTracker: ProgressTracker;

  beforeEach(() => {
    // Reset hashFiles mock to default behavior
    vi.mocked(hashFiles).mockResolvedValue(['abc123def456']);

    mockUser = { id: 'test-user-id' } as UserType;
    // Create a mock CryptoKey-like object
    const mockCryptoKey = {
      algorithm: { name: 'AES-GCM', length: 256 },
      type: 'secret',
      usages: ['encrypt', 'decrypt'],
      extractable: true,
    } as CryptoKey;

    mockKeychain = {
      get: vi.fn().mockResolvedValue(new Uint8Array(32)),
      content: {
        generateKey: vi.fn().mockResolvedValue(mockCryptoKey),
      },
      container: {
        wrapContentKey: vi.fn().mockResolvedValue('wrapped-key'),
      },
    } as unknown as Keychain;

    mockApi = {
      call: vi.fn(),
      isBucketStorage: true,
      serverUrl: 'http://localhost',
      getStorageType: vi.fn().mockReturnValue('bucket'),
      removeAuthToken: vi.fn(),
    } as unknown as ApiConnection;

    mockProgressTracker = {
      total: 0,
      progressed: 0,
      percentage: 0,
      error: '',
      text: '',
      fileName: '',
      processStage: 'idle' as const,
      initialize: vi.fn(),
      setUploadSize: vi.fn(),
      setText: vi.fn(),
      setProgress: vi.fn(),
      setFileName: vi.fn(),
      setProcessStage: vi.fn(),
    };

    uploader = new Uploader(mockUser, mockKeychain, mockApi);
  });

  describe('createMultipartProgressTracker', () => {
    it('should create a progress tracker that handles single file uploads', () => {
      const originalFileSize = 1000;
      const blobContent = 'x'.repeat(100); // 100 bytes
      const blob = new Blob([blobContent], {
        type: 'text/plain',
      }) as NamedBlob;
      blob.name = 'test.txt';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = (uploader as any).createMultipartProgressTracker(
        mockProgressTracker,
        [blob],
        false,
        originalFileSize
      );

      const partTracker = tracker.getPartTracker(0);

      // Test progress calculation for single part - progress directly maps for single files
      partTracker.setProgress(50); // 50 bytes uploaded
      expect(mockProgressTracker.setProgress).toHaveBeenCalledWith(50);
    });

    it('should create a progress tracker that handles multipart uploads correctly', () => {
      const originalFileSize = 2000;
      const blob1 = new Blob(['part1'], {
        type: 'application/zip',
      }) as NamedBlob;
      blob1.name = 'test.zip';
      const blob2 = new Blob(['part2'], {
        type: 'application/zip',
      }) as NamedBlob;
      blob2.name = 'test.zip';

      const blobs = [blob1, blob2];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = (uploader as any).createMultipartProgressTracker(
        mockProgressTracker,
        blobs,
        true,
        originalFileSize
      );

      // Test first part progress
      const partTracker1 = tracker.getPartTracker(0);
      partTracker1.setProgress(blob1.size); // Complete first part

      // Should report 50% progress (1 part complete out of 2)
      const expectedProgress = (1 / 2) * originalFileSize;
      expect(mockProgressTracker.setProgress).toHaveBeenCalledWith(
        expectedProgress
      );

      // Mark first part as complete
      tracker.markPartComplete(0);
      expect(mockProgressTracker.setProgress).toHaveBeenCalledWith(1000); // 50% of 2000

      // Test second part progress
      const partTracker2 = tracker.getPartTracker(1);
      partTracker2.setProgress(blob2.size / 2); // 50% of second part

      // Should report 75% progress (1 complete part + 50% of second part)
      const expectedProgress2 = 1000 + 0.5 * (originalFileSize / 2);
      expect(mockProgressTracker.setProgress).toHaveBeenCalledWith(
        expectedProgress2
      );
    });

    it('should set correct text labels for multipart uploads', () => {
      const blob1 = new Blob(['part1'], {
        type: 'application/zip',
      }) as NamedBlob;
      blob1.name = 'test.zip';
      const blob2 = new Blob(['part2'], {
        type: 'application/zip',
      }) as NamedBlob;
      blob2.name = 'test.zip';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = (uploader as any).createMultipartProgressTracker(
        mockProgressTracker,
        [blob1, blob2],
        true,
        2000
      );

      const partTracker1 = tracker.getPartTracker(0);
      partTracker1.setText('Encrypting file');

      expect(mockProgressTracker.setText).toHaveBeenCalledWith(
        'Encrypting file'
      );
    });

    it('should not add part labels for single file uploads', () => {
      const blob = new Blob(['content'], { type: 'text/plain' }) as NamedBlob;
      blob.name = 'test.txt';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = (uploader as any).createMultipartProgressTracker(
        mockProgressTracker,
        [blob],
        false,
        1000
      );

      const partTracker = tracker.getPartTracker(0);
      partTracker.setText('Encrypting file');

      expect(mockProgressTracker.setText).toHaveBeenCalledWith(
        'Encrypting file'
      );
    });

    it('should ensure progress never exceeds the original file size', () => {
      const originalFileSize = 1000;
      const blobContent = 'x'.repeat(100); // 100 bytes
      const blob = new Blob([blobContent], {
        type: 'text/plain',
      }) as NamedBlob;
      blob.name = 'test.txt';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = (uploader as any).createMultipartProgressTracker(
        mockProgressTracker,
        [blob],
        false,
        originalFileSize
      );

      const partTracker = tracker.getPartTracker(0);

      // Try to set progress beyond the blob size (it gets clamped to blob size)
      partTracker.setProgress(originalFileSize * 2);

      // Should be clamped to the blob size (100), which directly maps to progress for single files
      expect(mockProgressTracker.setProgress).toHaveBeenCalledWith(100);
    });
  });

  describe('suspicious file detection', () => {
    it('should generate file hash and check against suspicious files', async () => {
      const blob = new Blob(['test content'], {
        type: 'text/plain',
      }) as NamedBlob;
      blob.name = 'test.txt';

      mockApi.call = vi
        .fn()
        .mockResolvedValueOnce({ upload: { id: 'upload1' } })
        .mockResolvedValueOnce({ id: 'item1' });

      const containerId = 'container-id';

      await uploader.doUpload(blob, containerId, mockApi, mockProgressTracker);

      // Verify that fileHash was included in the upload creation call
      expect(mockApi.call).toHaveBeenCalledWith(
        'uploads',
        expect.objectContaining({
          fileHash: 'abc123def456',
        }),
        'POST',
        {},
        expect.objectContaining({ onFailure: expect.any(Function) })
      );
    });

    it('should block upload when file is marked as suspicious', async () => {
      const blob = new Blob(['suspicious content'], {
        type: 'text/plain',
      }) as NamedBlob;
      blob.name = 'suspicious.txt';

      // Mock hashFiles to throw an error for suspicious files
      vi.mocked(hashFiles).mockRejectedValueOnce(
        new Error('Suspicious file detected')
      );

      const containerId = 'container-id';

      // Should return null when hashFiles throws
      await expect(
        uploader.doUpload(blob, containerId, mockApi, mockProgressTracker)
      ).rejects.toThrow('Suspicious file detected');
    });

    it('should include fileHash in upload creation API call', async () => {
      const blob = new Blob(['test content'], {
        type: 'text/plain',
      }) as NamedBlob;
      blob.name = 'test.txt';

      mockApi.call = vi
        .fn()
        .mockResolvedValueOnce({ upload: { id: 'upload1' } })
        .mockResolvedValueOnce({ id: 'item1' });

      const containerId = 'container-id';

      await uploader.doUpload(blob, containerId, mockApi, mockProgressTracker);

      // Verify that fileHash was included in the upload creation call
      expect(mockApi.call).toHaveBeenCalledWith(
        'uploads',
        expect.objectContaining({
          fileHash: 'abc123def456',
        }),
        'POST',
        {},
        expect.objectContaining({ onFailure: expect.any(Function) })
      );
    });

    it('should handle hash check API errors gracefully', async () => {
      const blob = new Blob(['test content'], {
        type: 'text/plain',
      }) as NamedBlob;
      blob.name = 'test.txt';

      // Mock hashFiles to throw an error
      vi.mocked(hashFiles).mockRejectedValueOnce(
        new Error('Hash check failed')
      );

      const containerId = 'container-id';

      // Should throw the error from hash check
      await expect(
        uploader.doUpload(blob, containerId, mockApi, mockProgressTracker)
      ).rejects.toThrow('Hash check failed');
    });
  });

  describe('doUpload multipart logic', () => {
    it('should process multipart uploads in batches', async () => {
      // Create a large file that would trigger multipart upload
      const largeFileSize = SPLIT_SIZE + 1000;
      const largeBlob = new Blob(['x'.repeat(largeFileSize)], {
        type: 'text/plain',
      }) as NamedBlob;
      largeBlob.name = 'large-file.txt';

      // Mock hashFiles to return two hashes for multipart upload
      vi.mocked(hashFiles).mockResolvedValueOnce(['hash1', 'hash2']);

      // Mock API calls for both parts - handle concurrent calls by checking the endpoint
      let uploadCallCount = 0;
      let itemCallCount = 0;
      mockApi.call = vi.fn().mockImplementation((endpoint: string) => {
        if (endpoint === 'uploads') {
          uploadCallCount++;
          return Promise.resolve({
            upload: { id: `upload${uploadCallCount}` },
          });
        } else if (
          endpoint.includes('container') &&
          endpoint.includes('item')
        ) {
          itemCallCount++;
          return Promise.resolve({ id: `item${itemCallCount}` });
        }
        return Promise.resolve({});
      });

      const containerId = 'container-id';

      // The upload should process parts in batches and track progress correctly
      const result = await uploader.doUpload(
        largeBlob,
        containerId,
        mockApi,
        mockProgressTracker
      );

      expect(result).toHaveLength(2); // Should return 2 items for 2 parts
      expect(mockProgressTracker.setUploadSize).toHaveBeenCalledWith(
        largeFileSize
      ); // Original file size
      expect(mockProgressTracker.setProcessStage).toHaveBeenCalledWith(
        'preparing'
      );
      expect(mockProgressTracker.setText).toHaveBeenCalledWith(
        'Preparing file for upload'
      );
    });
  });

  describe('doUpload concurrency & failure handling', () => {
    // A lightweight stand-in for the source file: doUpload only reads .size /
    // .name off it and passes it to the (mocked) splitter + hasher, so we avoid
    // allocating a real >SPLIT_SIZE (500MB) buffer.
    const makeSourceBlob = (): NamedBlob =>
      ({
        size: SPLIT_SIZE + 1000,
        name: 'big.txt',
        type: 'text/plain',
      }) as unknown as NamedBlob;

    const makeParts = (n: number): NamedBlob[] =>
      Array.from({ length: n }, (_, i) =>
        Object.assign(new Blob([`part${i}`]), { name: `big-${i}.txt` })
      ) as NamedBlob[];

    const indexFromName = (blob: Blob): number =>
      Number((blob as NamedBlob).name.match(/big-(\d+)/)?.[1] ?? 0);

    const resolveDbCalls = () =>
      vi.fn().mockImplementation((endpoint: string) => {
        if (endpoint === 'uploads') {
          return Promise.resolve({ upload: { id: 'upload-db-id' } });
        }
        if (endpoint.includes('item')) {
          return Promise.resolve({ id: 'item-id' });
        }
        // uploads/cleanup and anything else
        return Promise.resolve({ message: 'ok' });
      });

    beforeEach(() => {
      vi.mocked(sendBlob).mockReset().mockResolvedValue('upload-id');
    });

    it('passes an abort signal and an onUploadId reporter to each part', async () => {
      vi.mocked(splitIntoMultipleZips).mockResolvedValueOnce(makeParts(2));
      vi.mocked(hashFiles).mockResolvedValueOnce(['h0', 'h1']);
      mockApi.call = resolveDbCalls();

      await uploader.doUpload(
        makeSourceBlob(),
        'container-id',
        mockApi,
        mockProgressTracker
      );

      expect(sendBlob).toHaveBeenCalledTimes(2);
      const options = vi.mocked(sendBlob).mock.calls[0][5];
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(typeof options?.onUploadId).toBe('function');
    });

    it('does not block later parts behind a stalled earlier part (no batch barrier)', async () => {
      const partCount = MAX_CONCURRENT_PARTS + 2; // 7 parts, 5 concurrent
      vi.mocked(splitIntoMultipleZips).mockResolvedValueOnce(
        makeParts(partCount)
      );
      vi.mocked(hashFiles).mockResolvedValueOnce(
        Array.from({ length: partCount }, (_, i) => `h${i}`)
      );
      mockApi.call = resolveDbCalls();

      const startedIndexes: number[] = [];
      let releasePart0: () => void = () => {};
      const part0Gate = new Promise<void>((resolve) => {
        releasePart0 = resolve;
      });

      vi.mocked(sendBlob).mockImplementation(
        async (blob, _key, _api, _tracker, _isBucket, options) => {
          const index = indexFromName(blob);
          startedIndexes.push(index);
          const id = `upload-${index}`;
          options?.onUploadId?.(id);
          // Part 0 stalls; every other part completes normally.
          if (index === 0) {
            await part0Gate;
          }
          return id;
        }
      );

      const uploadPromise = uploader.doUpload(
        makeSourceBlob(),
        'container-id',
        mockApi,
        mockProgressTracker
      );

      // The last part must be able to start while part 0 is still stalled — a
      // fixed batch-of-5 barrier would keep parts 5 & 6 from starting at all.
      await vi.waitFor(() => expect(startedIndexes).toContain(partCount - 1));
      expect(startedIndexes).toContain(MAX_CONCURRENT_PARTS); // index 5 started

      releasePart0();
      const result = await uploadPromise;
      expect(result).toHaveLength(partCount);
    });

    it('cleans up every written part and aborts siblings when a part fails', async () => {
      const parts = makeParts(3);
      vi.mocked(splitIntoMultipleZips).mockResolvedValueOnce(parts);
      vi.mocked(hashFiles).mockResolvedValueOnce(['h0', 'h1', 'h2']);
      mockApi.call = resolveDbCalls();

      let capturedSignal: AbortSignal | undefined;
      vi.mocked(sendBlob).mockImplementation(
        async (blob, _key, _api, _tracker, _isBucket, options) => {
          const index = indexFromName(blob);
          const id = `upload-${index}`;
          // Record the id before the (possible) failure, exactly as the real
          // sendBlob does right after obtaining the presigned URL.
          options?.onUploadId?.(id);
          capturedSignal = options?.signal;
          if (index === 1) {
            throw new Error('UPLOAD_FAILED');
          }
          return id;
        }
      );

      await expect(
        uploader.doUpload(
          makeSourceBlob(),
          'container-id',
          mockApi,
          mockProgressTracker
        )
      ).rejects.toThrow();

      // Siblings were cancelled.
      expect(capturedSignal?.aborted).toBe(true);

      // The backend was asked to remove the parts we began writing, including
      // the one that failed.
      const cleanupCall = vi
        .mocked(mockApi.call)
        .mock.calls.find(([endpoint]) => endpoint === 'uploads/cleanup');
      expect(cleanupCall).toBeDefined();
      expect(cleanupCall?.[1]?.ids).toContain('upload-1');
    });
  });
});
