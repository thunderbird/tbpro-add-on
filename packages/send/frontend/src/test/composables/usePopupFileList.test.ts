import { usePopupFileList } from '@send-frontend/apps/send/composables/usePopupFileList';
import { FILE_LIST, POPUP_READY, SIGN_OUT } from '@send-frontend/lib/const';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// How the composable behaves against the real background.ts is covered by
// packages/addon/src/test/integration/happy-popup-ready-once.test.ts.

const attached = {
  id: 1,
  name: 'report.pdf',
  data: new File(['report'], 'report.pdf'),
};

describe('usePopupFileList', () => {
  let listeners: ((message: unknown) => unknown)[];
  let runtime: {
    onMessage: { addListener: ReturnType<typeof vi.fn> };
    sendMessage: ReturnType<typeof vi.fn>;
  };

  function deliver(message: unknown) {
    return Promise.all(listeners.map((listener) => listener(message)));
  }

  beforeEach(() => {
    listeners = [];
    runtime = {
      onMessage: {
        addListener: vi.fn((listener) => listeners.push(listener)),
      },
      sendMessage: vi.fn(),
    };
    vi.stubGlobal('browser', { runtime });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers one listener and sends one POPUP_READY, however often it is called', () => {
    const { requestFiles } = usePopupFileList();

    requestFiles();
    requestFiles();

    expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: POPUP_READY });
  });

  it('keeps the files from FILE_LIST and clears them on SIGN_OUT', async () => {
    const { files, requestFiles } = usePopupFileList();
    requestFiles();

    await deliver({ type: FILE_LIST, files: [attached] });
    expect(files.value).toEqual([attached]);

    await deliver({ type: SIGN_OUT });
    expect(files.value).toEqual([]);
  });

  it('throws and registers nothing when browser.runtime is unavailable, then works once it is', () => {
    vi.stubGlobal('browser', undefined);
    const { requestFiles } = usePopupFileList();

    expect(() => requestFiles()).toThrow();

    vi.stubGlobal('browser', { runtime });
    requestFiles();

    expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: POPUP_READY });
  });
});
