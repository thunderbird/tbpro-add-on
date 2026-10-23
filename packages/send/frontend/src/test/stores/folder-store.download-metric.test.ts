import useFolderStore from '@send-frontend/apps/send/stores/folder-store';
import type { ProgressTracker } from '@send-frontend/apps/send/stores/status-store';
import { ANALYTICS_EVENTS } from '@send-frontend/lib/analytics/events';
import type { ApiConnection } from '@send-frontend/lib/api';
import { _saveFileStream } from '@send-frontend/lib/filesync';
import type { Keychain } from '@send-frontend/lib/keychain';
import useMetricsStore from '@send-frontend/stores/metrics';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Multipart downloads must emit the same `file_downloaded` event as
// single-part ones, with the whole file's size and type.

vi.mock('@send-frontend/lib/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@send-frontend/lib/helpers')>()),
  _download: vi.fn(async () => new Blob(['zipped'])),
}));
vi.mock('@send-frontend/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@send-frontend/lib/utils')>()),
  unzipMultipartPiece: vi.fn(async () => ({
    content: new ArrayBuffer(4),
    isMultipart: true,
  })),
}));
vi.mock('@send-frontend/lib/filesync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@send-frontend/lib/filesync')>()),
  _saveFileStream: vi.fn(async ({ stream }) => {
    await new Response(stream).arrayBuffer();
  }),
}));

const PARTS = [
  { id: 'part-2', part: 2, size: 40, type: 'application/zip' },
  { id: 'part-1', part: 1, size: 100, type: 'application/zip' },
];

const api = {
  call: vi.fn(async (path: string) => {
    if (path.endsWith('/parts'))
      return PARTS.map(({ id, part }) => ({ id, part }));
    if (path.endsWith('/metadata')) {
      const { size, type } = PARTS.find((p) => path.includes(p.id))!;
      return { size, type };
    }
    if (path.endsWith('/signed')) return { url: 'https://bucket.test/obj' };
    return undefined;
  }),
} as unknown as ApiConnection;

const keychain = {
  get: vi.fn(async () => ({})),
  // No content key: pieces are read as-is, so no real decryption is needed.
  container: { unwrapContentKey: vi.fn(async () => null) },
} as unknown as Keychain;

const progress = {
  setUploadSize: vi.fn(),
  setProcessStage: vi.fn(),
  setText: vi.fn(),
  setProgress: vi.fn(),
} as unknown as ProgressTracker;

function download() {
  return useFolderStore().downloadMultipart(
    [{ id: 'part-1', part: 1 }],
    'container-1',
    'wrapped-key',
    'big%20file.zip',
    api,
    keychain,
    progress
  );
}

describe('FolderStore — downloadMultipart analytics', () => {
  let capture: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    capture = vi
      .spyOn(useMetricsStore().metrics, 'capture')
      .mockReturnValue(undefined);
  });

  it('captures file_downloaded with the total size and part count', async () => {
    await download();

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith(ANALYTICS_EVENTS.FILE_DOWNLOADED, {
      size: 140,
      type: 'application/zip',
      part_count: 2,
    });
  });

  it('captures nothing when saving the file fails', async () => {
    vi.mocked(_saveFileStream).mockRejectedValueOnce(new Error('disk full'));

    await expect(download()).rejects.toThrow('disk full');
    expect(capture).not.toHaveBeenCalled();
  });
});
