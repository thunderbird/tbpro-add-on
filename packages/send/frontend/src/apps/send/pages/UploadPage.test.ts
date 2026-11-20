import { ALL_UPLOADS_ABORTED } from '@send-frontend/lib/const';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UploadPage from './UploadPage.vue';

const { host, folderStore, sharingStore } = vi.hoisted(() => ({
  host: { isThunderbirdHost: false },
  folderStore: {
    getDefaultFolderId: vi.fn(),
    uploadItem: vi.fn(),
  },
  sharingStore: { shareItems: vi.fn() },
}));

vi.mock('@send-frontend/stores', () => ({
  useConfigStore: () => ({ isThunderbirdHost: host.isThunderbirdHost }),
}));
vi.mock('@send-frontend/apps/send/stores/folder-store', () => ({
  default: () => folderStore,
}));
vi.mock('@send-frontend/apps/send/stores/sharing-store', () => ({
  default: () => sharingStore,
}));
vi.mock('@send-frontend/apps/send/stores/status-store', () => ({
  useStatusStore: () => ({ progress: { initialize: vi.fn() } }),
}));
vi.mock('@send-frontend/lib/init', () => ({ default: vi.fn() }));
vi.mock('@send-frontend/stores/api-store', () => ({
  default: () => ({ api: {} }),
}));
vi.mock('@send-frontend/stores/keychain-store', () => ({
  default: () => ({ keychain: {} }),
}));
vi.mock('@send-frontend/stores/user-store', () => ({
  default: () => ({ user: { uniqueHash: 'hash' } }),
}));
vi.mock('@send-frontend/stores/metrics', () => ({
  default: () => ({ initializeClientMetrics: vi.fn() }),
}));
vi.mock('@send-frontend/apps/common/mixins/metrics', () => ({
  useMetricsUpdate: vi.fn(),
}));

const stubs = {
  PasswordStep: true,
  ExpirationStep: true,
  UploadingStep: true,
  SuccessStep: true,
  ErrorStep: true,
};

const pickedFile = {
  id: 1,
  name: 'report.pdf',
  data: new File(['report'], 'report.pdf', { type: 'application/pdf' }),
};

// Walks the two steps the user clicks through and presses "Create Link".
async function createLink(props: Record<string, unknown>) {
  const wrapper = mount(UploadPage, { props, global: { stubs } });
  await flushPromises();
  wrapper.findComponent({ name: 'PasswordStep' }).vm.$emit('next');
  await flushPromises();
  wrapper.findComponent({ name: 'ExpirationStep' }).vm.$emit('createLink');
  await flushPromises();
  return wrapper;
}

describe('UploadPage', () => {
  const sendMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    host.isThunderbirdHost = false;
    folderStore.getDefaultFolderId.mockResolvedValue('folder-1');
    folderStore.uploadItem.mockResolvedValue([{ id: 10, multipart: false }]);
    sharingStore.shareItems.mockResolvedValue('https://send.example/share/1');
    vi.stubGlobal('browser', { runtime: { sendMessage } });
    vi.spyOn(window, 'close').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([{ files: null }, { files: [] }])(
    'uploads nothing and shows an error when files is $files (web)',
    async ({ files }) => {
      const wrapper = await createLink({ files });

      expect(folderStore.getDefaultFolderId).not.toHaveBeenCalled();
      expect(folderStore.uploadItem).not.toHaveBeenCalled();
      expect(sharingStore.shareItems).not.toHaveBeenCalled();
      expect(
        wrapper.findComponent({ name: 'ErrorStep' }).props('uploadError')
      ).toMatch(/No files to upload/);
    }
  );

  it('aborts instead of uploading when the file list is empty (add-on)', async () => {
    host.isThunderbirdHost = true;
    const onUploadAndShare = vi.fn();

    await createLink({ files: [], onUploadAndShare });

    expect(onUploadAndShare).not.toHaveBeenCalled();
    expect(folderStore.uploadItem).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith({
      type: ALL_UPLOADS_ABORTED,
      aborted: true,
    });
    expect(window.close).toHaveBeenCalled();
  });

  it('hands the picked files to the add-on upload handler', async () => {
    host.isThunderbirdHost = true;
    const onUploadAndShare = vi.fn().mockResolvedValue(undefined);

    await createLink({ files: [pickedFile], onUploadAndShare });

    expect(onUploadAndShare).toHaveBeenCalledTimes(1);
    expect(onUploadAndShare.mock.calls[0][0]).toEqual([pickedFile]);
    expect(folderStore.uploadItem).not.toHaveBeenCalled();
  });

  it('uploads and shares exactly the picked files on the web', async () => {
    const wrapper = await createLink({ files: [pickedFile] });

    expect(folderStore.uploadItem).toHaveBeenCalledTimes(1);
    expect(folderStore.uploadItem).toHaveBeenCalledWith(
      pickedFile.data,
      'folder-1',
      {}
    );
    expect(sharingStore.shareItems).toHaveBeenCalledTimes(1);
    expect(
      wrapper.findComponent({ name: 'SuccessStep' }).props('shareUrl')
    ).toBe('https://send.example/share/1');
  });
});
