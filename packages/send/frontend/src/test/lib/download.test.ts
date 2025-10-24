import { ProgressTracker } from '@send-frontend/apps/send/stores/status-store';
import { ApiConnection } from '@send-frontend/lib/api';
import Downloader from '@send-frontend/lib/download';
import { Keychain } from '@send-frontend/lib/keychain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@send-frontend/lib/filesync', () => ({
  getBlob: vi.fn().mockResolvedValue('downloaded-file-url'),
}));

describe('Downloader', () => {
  let downloader: Downloader;
  let mockKeychain: Keychain;
  let mockApi: ApiConnection;
  let mockProgressTracker: ProgressTracker;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockMetrics: any;

  beforeEach(() => {
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
        unwrapContentKey: vi.fn().mockResolvedValue(mockCryptoKey),
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

    mockMetrics = {
      capture: vi.fn(),
    };

    downloader = new Downloader(mockKeychain, mockApi);
  });

  describe('doDownload', () => {
    const testParams = {
      id: 'test-upload-id',
      folderId: 'test-folder-id',
      wrappedKeyStr: 'test-wrapped-key',
      filename: 'test-file.txt',
    };

    it('should successfully download a file when all conditions are met', async () => {
      // Setup successful API responses
      mockApi.call = vi
        .fn()
        .mockResolvedValueOnce({ isSuspicious: false }) // hash check response
        .mockResolvedValueOnce({ size: 1024, type: 'text/plain' }); // metadata response

      const result = await downloader.doDownload(
        testParams.id,
        testParams.folderId,
        testParams.wrappedKeyStr,
        testParams.filename,
        mockMetrics,
        mockProgressTracker
      );

      expect(result).toBe(true);
      expect(mockApi.call).toHaveBeenCalledWith(
        `download/check-upload-id/${testParams.id}`
      );
      expect(mockApi.call).toHaveBeenCalledWith(
        `uploads/${testParams.id}/metadata`
      );
      expect(mockProgressTracker.setFileName).toHaveBeenCalledWith(
        testParams.filename
      );
      expect(mockProgressTracker.setProcessStage).toHaveBeenCalledWith(
        'downloading'
      );
      expect(mockMetrics.capture).toHaveBeenCalledWith('download.size', {
        size: 1024,
        type: 'text/plain',
      });
    });

    it('should return false when id is missing', async () => {
      const result = await downloader.doDownload(
        '',
        testParams.folderId,
        testParams.wrappedKeyStr,
        testParams.filename,
        mockMetrics,
        mockProgressTracker
      );

      expect(result).toBe(false);
      expect(mockApi.call).not.toHaveBeenCalled();
    });

    it('should return false when folderId is missing', async () => {
      const result = await downloader.doDownload(
        testParams.id,
        '',
        testParams.wrappedKeyStr,
        testParams.filename,
        mockMetrics,
        mockProgressTracker
      );

      expect(result).toBe(false);
      expect(mockApi.call).not.toHaveBeenCalled();
    });

    it('should throw error when file is marked as suspicious', async () => {
      mockApi.call = vi.fn().mockResolvedValueOnce({ isSuspicious: true });

      await expect(
        downloader.doDownload(
          testParams.id,
          testParams.folderId,
          testParams.wrappedKeyStr,
          testParams.filename,
          mockMetrics,
          mockProgressTracker
        )
      ).rejects.toThrow('File has been reported as suspicious');

      expect(mockApi.call).toHaveBeenCalledWith(
        `download/check-upload-id/${testParams.id}`
      );
      expect(mockApi.call).toHaveBeenCalledTimes(1);
    });

    it('should return false when wrapping key is not found', async () => {
      mockApi.call = vi.fn().mockResolvedValueOnce({ isSuspicious: false });
      mockKeychain.get = vi.fn().mockResolvedValue(null);

      const result = await downloader.doDownload(
        testParams.id,
        testParams.folderId,
        testParams.wrappedKeyStr,
        testParams.filename,
        mockMetrics,
        mockProgressTracker
      );

      expect(result).toBe(false);
      expect(mockKeychain.get).toHaveBeenCalledWith(testParams.folderId);
    });

    it('should return false when file size is zero or missing', async () => {
      mockApi.call = vi
        .fn()
        .mockResolvedValueOnce({ isSuspicious: false })
        .mockResolvedValueOnce({ size: 0, type: 'text/plain' });

      const result = await downloader.doDownload(
        testParams.id,
        testParams.folderId,
        testParams.wrappedKeyStr,
        testParams.filename,
        mockMetrics,
        mockProgressTracker
      );

      expect(result).toBe(false);
    });

    it('should return false when getBlob throws an error', async () => {
      const { getBlob } = await import('@send-frontend/lib/filesync');

      mockApi.call = vi
        .fn()
        .mockResolvedValueOnce({ isSuspicious: false })
        .mockResolvedValueOnce({ size: 1024, type: 'text/plain' });

      // Mock getBlob to throw an error
      vi.mocked(getBlob).mockRejectedValueOnce(new Error('Download failed'));

      const result = await downloader.doDownload(
        testParams.id,
        testParams.folderId,
        testParams.wrappedKeyStr,
        testParams.filename,
        mockMetrics,
        mockProgressTracker
      );

      expect(result).toBe(false);
      expect(mockProgressTracker.setFileName).toHaveBeenCalledWith(
        testParams.filename
      );
      expect(mockProgressTracker.setProcessStage).toHaveBeenCalledWith(
        'downloading'
      );
    });

    it('should handle hash check API errors', async () => {
      mockApi.call = vi
        .fn()
        .mockRejectedValueOnce(new Error('Hash check API failed'));

      await expect(
        downloader.doDownload(
          testParams.id,
          testParams.folderId,
          testParams.wrappedKeyStr,
          testParams.filename,
          mockMetrics,
          mockProgressTracker
        )
      ).rejects.toThrow('Hash check API failed');
    });

    it('should handle metadata API errors', async () => {
      mockApi.call = vi
        .fn()
        .mockResolvedValueOnce({ isSuspicious: false })
        .mockRejectedValueOnce(new Error('Metadata API failed'));

      await expect(
        downloader.doDownload(
          testParams.id,
          testParams.folderId,
          testParams.wrappedKeyStr,
          testParams.filename,
          mockMetrics,
          mockProgressTracker
        )
      ).rejects.toThrow('Metadata API failed');
    });

    it('should call keychain.container.unwrapContentKey with correct parameters', async () => {
      const mockWrappingKey = new Uint8Array(32);
      mockKeychain.get = vi.fn().mockResolvedValue(mockWrappingKey);

      mockApi.call = vi
        .fn()
        .mockResolvedValueOnce({ isSuspicious: false })
        .mockResolvedValueOnce({ size: 1024, type: 'text/plain' });

      await downloader.doDownload(
        testParams.id,
        testParams.folderId,
        testParams.wrappedKeyStr,
        testParams.filename,
        mockMetrics,
        mockProgressTracker
      );

      expect(mockKeychain.container.unwrapContentKey).toHaveBeenCalledWith(
        testParams.wrappedKeyStr,
        mockWrappingKey
      );
    });

    it('should pass correct parameters to getBlob', async () => {
      const { getBlob } = await import('@send-frontend/lib/filesync');
      const mockContentKey = { type: 'secret' } as CryptoKey;

      mockKeychain.container.unwrapContentKey = vi
        .fn()
        .mockResolvedValue(mockContentKey);

      mockApi.call = vi
        .fn()
        .mockResolvedValueOnce({ isSuspicious: false })
        .mockResolvedValueOnce({ size: 1024, type: 'text/plain' });

      await downloader.doDownload(
        testParams.id,
        testParams.folderId,
        testParams.wrappedKeyStr,
        testParams.filename,
        mockMetrics,
        mockProgressTracker
      );

      expect(getBlob).toHaveBeenCalledWith(
        testParams.id,
        1024,
        mockContentKey,
        true, // isBucketStorage
        testParams.filename,
        'text/plain',
        mockApi,
        mockProgressTracker
      );
    });

    it('should work with non-bucket storage', async () => {
      const { getBlob } = await import('@send-frontend/lib/filesync');
      mockApi.isBucketStorage = false;

      mockApi.call = vi
        .fn()
        .mockResolvedValueOnce({ isSuspicious: false })
        .mockResolvedValueOnce({ size: 1024, type: 'text/plain' });

      await downloader.doDownload(
        testParams.id,
        testParams.folderId,
        testParams.wrappedKeyStr,
        testParams.filename,
        mockMetrics,
        mockProgressTracker
      );

      expect(getBlob).toHaveBeenCalledWith(
        testParams.id,
        1024,
        expect.any(Object), // contentKey
        false, // isBucketStorage
        testParams.filename,
        'text/plain',
        mockApi,
        mockProgressTracker
      );
    });
  });

  describe('constructor', () => {
    it('should initialize with keychain and api', () => {
      const testDownloader = new Downloader(mockKeychain, mockApi);

      expect(testDownloader.keychain).toBe(mockKeychain);
      expect(testDownloader.api).toBe(mockApi);
    });
  });
});
