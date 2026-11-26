import { usePopupFileList } from '@send-frontend/apps/send/composables/usePopupFileList';
import { FILE_LIST, POPUP_READY, SIGN_OUT } from '@send-frontend/lib/const';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

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
    onMessage: {
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
    sendMessage: ReturnType<typeof vi.fn>;
  };
  let scope: EffectScope;

  function deliver(message: unknown) {
    return Promise.all(listeners.map((listener) => listener(message)));
  }

  // PopupView calls the composable from setup(), inside a component's scope.
  function mount() {
    scope = effectScope();
    return scope.run(() => usePopupFileList())!;
  }

  beforeEach(() => {
    listeners = [];
    runtime = {
      onMessage: {
        addListener: vi.fn((listener) => listeners.push(listener)),
        removeListener: vi.fn(),
      },
      sendMessage: vi.fn(),
    };
    vi.stubGlobal('browser', { runtime });
  });

  afterEach(() => {
    scope?.stop();
    vi.unstubAllGlobals();
  });

  it('registers one listener and sends one POPUP_READY, however often it is called', () => {
    const { requestFiles } = mount();

    requestFiles();
    requestFiles();

    expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: POPUP_READY });
  });

  it('keeps the files from FILE_LIST and clears them on SIGN_OUT', async () => {
    const { files, requestFiles } = mount();
    requestFiles();

    await deliver({ type: FILE_LIST, files: [attached] });
    expect(files.value).toEqual([attached]);

    await deliver({ type: SIGN_OUT });
    expect(files.value).toEqual([]);
  });

  it('throws and registers nothing when browser.runtime is unavailable, then works once it is', () => {
    vi.stubGlobal('browser', undefined);
    const { requestFiles } = mount();

    expect(() => requestFiles()).toThrow();

    vi.stubGlobal('browser', { runtime });
    requestFiles();

    expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: POPUP_READY });
  });

  it('removes its listener when its scope is disposed', () => {
    mount().requestFiles();
    const [listener] = runtime.onMessage.addListener.mock.calls[0];

    scope.stop();

    expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
    expect(runtime.onMessage.removeListener).toHaveBeenCalledWith(listener);
  });

  it('ignores a request that arrives after its scope is disposed', () => {
    const { requestFiles } = mount();
    scope.stop();

    requestFiles();

    expect(runtime.onMessage.addListener).not.toHaveBeenCalled();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });
});
