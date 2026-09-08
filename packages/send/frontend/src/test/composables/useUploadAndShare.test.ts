import { useUploadAndShare } from '@send-frontend/apps/send/composables/useUploadAndShare';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

// Controllable lock flag + spies shared with the store mocks below.
const keychain = { locked: false };
const uploadItem = vi.fn();
const getDefaultFolderId = vi.fn().mockResolvedValue('folder-123');
const shareItems = vi.fn().mockResolvedValue('https://share.example/abc');

vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: () => ({ keychain }),
}));

vi.mock('@send-frontend/apps/send/stores/folder-store', () => ({
  default: () => ({ uploadItem, getDefaultFolderId }),
}));

vi.mock('@send-frontend/apps/send/stores/sharing-store', () => ({
  default: () => ({ shareItems }),
}));

vi.mock('@send-frontend/stores/api-store', () => ({
  default: () => ({ api: {} }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FILES = [
  { id: 1, name: 'report.pdf', data: new File(['hi'], 'report.pdf') },
];

describe('useUploadAndShare — keychain lock guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    keychain.locked = false;
    uploadItem.mockResolvedValue([{ id: 'item-1' }]);
    getDefaultFolderId.mockResolvedValue('folder-123');
    shareItems.mockResolvedValue('https://share.example/abc');
    // The composable messages background.ts and closes the popup window on
    // completion/abort; stub both so tests stay headless.
    vi.stubGlobal('browser', {
      runtime: { sendMessage: vi.fn() },
    });
    vi.stubGlobal('close', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws and does NOT upload any bytes when the keychain is locked', async () => {
    keychain.locked = true;
    const { uploadAndShare, isError, isUploading } = useUploadAndShare();

    await expect(uploadAndShare(FILES, 'password')).rejects.toThrow(
      /encryption keys are locked/i
    );

    expect(uploadItem).not.toHaveBeenCalled();
    expect(shareItems).not.toHaveBeenCalled();
    expect(isError.value).toBe(true);
    expect(isUploading.value).toBe(false);
  });

  it('uploads and shares normally when the keychain is unlocked', async () => {
    const { uploadAndShare, isError, uploadMap } = useUploadAndShare();

    await uploadAndShare(FILES, 'password');

    expect(uploadItem).toHaveBeenCalledTimes(1);
    expect(shareItems).toHaveBeenCalledTimes(1);
    expect(isError.value).toBe(false);
    expect(uploadMap.value.get(1)).toBe(true);
  });
});
