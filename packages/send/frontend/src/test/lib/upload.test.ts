import { ProgressTracker } from '@send-frontend/apps/send/stores/status-store';
import { ApiConnection } from '@send-frontend/lib/api';
import { SPLIT_SIZE } from '@send-frontend/lib/const';
import { NamedBlob } from '@send-frontend/lib/filesync';
import { Keychain } from '@send-frontend/lib/keychain';
import Uploader from '@send-frontend/lib/upload';
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
}));

describe('Uploader', () => {
  let uploader: Uploader;
  let mockUser: UserType;
  let mockKeychain: Keychain;
  let mockApi: ApiConnection;
  let mockProgressTracker: ProgressTracker;

  beforeEach(() => {
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
      const fileSize = 1000;
      const blob = new Blob(['test content'], {
        type: 'text/plain',
      }) as NamedBlob;
      blob.name = 'test.txt';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tracker = (uploader as any).createMultipartProgressTracker(
        mockProgressTracker,
        [blob],
        false,
        fileSize
      );

      const partTracker = tracker.getPartTracker(0);

      // Test progress calculation for single part
      partTracker.setProgress(500); // 50% of part
      expect(mockProgressTracker.setProgress).toHaveBeenCalledWith(500);
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
      const blob = new Blob(['test content'], {
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

      // Try to set progress beyond the original file size
      partTracker.setProgress(originalFileSize * 2);

      // Should be clamped to the original file size
      expect(mockProgressTracker.setProgress).toHaveBeenCalledWith(
        originalFileSize
      );
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
        .mockResolvedValueOnce({ isSuspicious: false }) // check-hash response
        .mockResolvedValueOnce({ upload: { id: 'upload1' } })
        .mockResolvedValueOnce({ id: 'item1' });

      const containerId = 'container-id';

      await uploader.doUpload(blob, containerId, mockApi, mockProgressTracker);

      // Verify that the API was called to check the hash
      expect(mockApi.call).toHaveBeenCalledWith(
        'uploads/check-hash',
        { fileHash: 'abc123def456' },
        'POST'
      );
    });

    it('should block upload when file is marked as suspicious', async () => {
      const blob = new Blob(['suspicious content'], {
        type: 'text/plain',
      }) as NamedBlob;
      blob.name = 'suspicious.txt';

      // Mock alert function
      const mockAlert = vi.fn();
      global.alert = mockAlert;

      mockApi.call = vi.fn().mockResolvedValueOnce({ isSuspicious: true }); // check-hash response

      const containerId = 'container-id';

      const result = await uploader.doUpload(
        blob,
        containerId,
        mockApi,
        mockProgressTracker
      );

      // Verify that upload was blocked
      expect(result).toBeNull();
      expect(mockAlert).toHaveBeenCalledWith(
        'Warning: This file has been reported as suspicious. You cannot upload it. If you believe this is an error, please contact support.'
      );
      // Verify that only the hash check API call was made
      expect(mockApi.call).toHaveBeenCalledTimes(1);
      expect(mockApi.call).toHaveBeenCalledWith(
        'uploads/check-hash',
        { fileHash: 'abc123def456' },
        'POST'
      );
    });

    it('should include fileHash in upload creation API call', async () => {
      const blob = new Blob(['test content'], {
        type: 'text/plain',
      }) as NamedBlob;
      blob.name = 'test.txt';

      mockApi.call = vi
        .fn()
        .mockResolvedValueOnce({ isSuspicious: false }) // check-hash response
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
        'POST'
      );
    });

    it('should handle hash check API errors gracefully', async () => {
      const blob = new Blob(['test content'], {
        type: 'text/plain',
      }) as NamedBlob;
      blob.name = 'test.txt';

      mockApi.call = vi
        .fn()
        .mockRejectedValueOnce(new Error('Hash check failed')); // check-hash error

      const containerId = 'container-id';

      // Should throw the error from hash check
      await expect(
        uploader.doUpload(blob, containerId, mockApi, mockProgressTracker)
      ).rejects.toThrow('Hash check failed');
    });
  });

  describe('doUpload multipart logic', () => {
    beforeEach(() => {
      // Setup mock API call for hash checking in multipart tests
      mockApi.call = vi.fn().mockResolvedValueOnce({ isSuspicious: false }); // Always add hash check response first
    });

    it('should process multipart uploads sequentially', async () => {
      // Create a large file that would trigger multipart upload
      const largeFileSize = SPLIT_SIZE + 1000;
      const largeBlob = new Blob(['x'.repeat(largeFileSize)], {
        type: 'text/plain',
      }) as NamedBlob;
      largeBlob.name = 'large-file.txt';

      mockApi.call = vi
        .fn()
        .mockResolvedValueOnce({ isSuspicious: false }) // hash check response
        .mockResolvedValueOnce({ upload: { id: 'upload1' } })
        .mockResolvedValueOnce({ id: 'item1' })
        .mockResolvedValueOnce({ upload: { id: 'upload2' } })
        .mockResolvedValueOnce({ id: 'item2' });

      const containerId = 'container-id';

      // The upload should process parts sequentially and track progress correctly
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
});
