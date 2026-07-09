import { ProgressTracker } from '@send-frontend/apps/send/stores/status-store';
import { ApiConnection } from '@send-frontend/lib/api';
import { MAX_CONCURRENT_PARTS, SPLIT_SIZE } from '@send-frontend/lib/const';
import { NamedBlob, sendBlob } from '@send-frontend/lib/filesync';
import { Keychain } from '@send-frontend/lib/keychain';
import Uploader from '@send-frontend/lib/upload';
import { hashFiles, streamZippedParts } from '@send-frontend/lib/utils';
import { UserType } from '@send-frontend/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@send-frontend/lib/filesync', () => ({
  sendBlob: vi.fn().mockResolvedValue('upload-id'),
}));

vi.mock('@send-frontend/lib/utils', () => ({
  retryUntilSuccessOrTimeout: vi.fn().mockResolvedValue(undefined),
  generateFileHash: vi.fn().mockResolvedValue('abc123def456'),
  // Single-part (small file) path.
  hashFiles: vi.fn().mockResolvedValue(['abc123def456']),
  // Multipart path: a streaming producer yielding one {blob, hash} per window.
  streamZippedParts: vi.fn(),
}));

// doUpload pre-captures the OIDC access token (via a dynamic import) so the
// pagehide teardown can send an authenticated cleanup — this is what makes the
// cleanup work in the add-on, which has no backend cookie.
vi.mock('@send-frontend/stores/auth-store', () => ({
  useAuthStore: () => ({
    getAccessToken: vi.fn().mockResolvedValue('test-bearer-token'),
  }),
}));

// Builds the async generator the mocked streamZippedParts returns, yielding one
// upload-ready part per blob (hash "h<index>"), mirroring the real producer.
async function* yieldParts(parts: NamedBlob[]) {
  for (let i = 0; i < parts.length; i++) {
    yield { blob: parts[i], hash: `h${i}` };
  }
}

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
        [blob.size],
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = (uploader as any).createMultipartProgressTracker(
        mockProgressTracker,
        [blob1.size, blob2.size],
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
        [blob1.size, blob2.size],
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
        [blob.size],
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
        [blob.size],
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

      // Mock the streaming producer to yield two parts for this multipart upload.
      vi.mocked(streamZippedParts).mockImplementationOnce(() =>
        yieldParts([
          Object.assign(new Blob(['part0']), {
            name: 'large-file.txt',
          }) as NamedBlob,
          Object.assign(new Blob(['part1']), {
            name: 'large-file.txt',
          }) as NamedBlob,
        ])
      );

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
        'hashing'
      );
      expect(mockProgressTracker.setText).toHaveBeenCalledWith('Hashing file');
    });
  });

  describe('doUpload concurrency & failure handling', () => {
    // A lightweight stand-in for the source file: doUpload only reads .size /
    // .name off it and passes it to the (mocked) streaming producer, so we avoid
    // allocating a real >SPLIT_SIZE buffer. Its size must yield exactly
    // `nChunks` windows (ceil(size / SPLIT_SIZE)) so numChunks matches the number
    // of parts the mocked producer yields.
    const makeSourceBlob = (nChunks = 2): NamedBlob =>
      ({
        size: SPLIT_SIZE * (nChunks - 1) + 1000,
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

    // Restore any global stubbed within a test (e.g. the fetch stub used by the
    // pagehide-teardown test) even if an assertion throws mid-test.
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('passes an abort signal and an onUploadId reporter to each part', async () => {
      vi.mocked(streamZippedParts).mockImplementationOnce(() =>
        yieldParts(makeParts(2))
      );
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
      vi.mocked(streamZippedParts).mockImplementationOnce(() =>
        yieldParts(makeParts(partCount))
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
        makeSourceBlob(partCount),
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
      vi.mocked(streamZippedParts).mockImplementationOnce(() =>
        yieldParts(parts)
      );
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
          makeSourceBlob(3),
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

    it('fails (instead of hanging) when the producer yields fewer parts than expected', async () => {
      // Source implies 3 windows, but the stream only yields 2 (e.g. the file
      // was truncated between selection and the streamed read). The waiting
      // worker for the missing part must fail, not hang forever.
      vi.mocked(streamZippedParts).mockImplementationOnce(() =>
        yieldParts(makeParts(2))
      );
      mockApi.call = resolveDbCalls();
      vi.mocked(sendBlob).mockResolvedValue('upload-id');

      await expect(
        uploader.doUpload(
          makeSourceBlob(3),
          'container-id',
          mockApi,
          mockProgressTracker
        )
      ).rejects.toThrow(/expected parts/);
    });

    it('sends an authenticated keepalive cleanup on pagehide while parts are in flight', async () => {
      // Guards the add-on divergence: the teardown cleanup that fires when the
      // user closes the tab/popup mid-upload must carry the Bearer token, since
      // the add-on has no backend cookie for the raw `credentials: 'include'`
      // fetch to rely on. A regression here would silently strand orphaned parts
      // in the add-on only.
      vi.mocked(streamZippedParts).mockImplementationOnce(() =>
        yieldParts(makeParts(3))
      );
      mockApi.call = resolveDbCalls();

      const fetchMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('fetch', fetchMock);

      // Hold every part open so the upload is still in flight (and the pagehide
      // listener still registered) when the page hides.
      let releaseParts: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        releaseParts = resolve;
      });
      vi.mocked(sendBlob).mockImplementation(
        async (blob, _key, _api, _tracker, _isBucket, options) => {
          const id = `upload-${indexFromName(blob)}`;
          options?.onUploadId?.(id); // populates writtenUploadIds before stalling
          await gate;
          return id;
        }
      );

      const uploadPromise = uploader.doUpload(
        makeSourceBlob(3),
        'container-id',
        mockApi,
        mockProgressTracker
      );

      // Wait until at least one part has registered its upload id.
      await vi.waitFor(() =>
        expect(vi.mocked(sendBlob).mock.calls.length).toBeGreaterThan(0)
      );

      // User closes the tab/popup mid-upload.
      window.dispatchEvent(new Event('pagehide'));

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost/api/uploads/cleanup');
      expect(init).toMatchObject({
        method: 'POST',
        keepalive: true,
        headers: expect.objectContaining({
          Authorization: 'Bearer test-bearer-token',
        }),
      });
      expect(JSON.parse(init.body).ids.length).toBeGreaterThan(0);

      releaseParts();
      await uploadPromise;
    });
  });
});
