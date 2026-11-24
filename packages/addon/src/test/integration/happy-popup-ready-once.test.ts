/**
 * HAPPY PATH — the upload popup keeps its files when it re-initializes.
 *
 * PopupView.vue calls usePopupFileList()'s requestFiles() from initialize(),
 * which re-runs on every refetch of its configuration query (window focus,
 * mount). background.ts answers POPUP_READY with its whole queue and then
 * empties it, so asking a second time would get back an empty FILE_LIST and
 * wipe the files on screen (#1417). This spec runs the real composable in the
 * popup context against the real background.ts.
 */
import { usePopupFileList } from '@send-frontend/apps/send/composables/usePopupFileList';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeBrowserContext, type FakeHost } from './fakeThunderbirdHost';
import {
  attachAndOpenPopup,
  setupHost,
  stubContext,
  teardownHost,
} from './testHelpers';

// background.ts reads the global `browser` when it handles a message, and the
// harness has only one global at a time. Run each of the context's listeners
// with its own `browser`, so background's FILE_LIST reply is sent from the
// background and reaches the popup. This covers the synchronous part of a
// listener, which is all POPUP_READY needs.
function runListenersInOwnContext(ctx: FakeBrowserContext) {
  ctx.onMessageListeners.forEach((listener, i) => {
    ctx.onMessageListeners[i] = (message, sender) => {
      const previous = Reflect.get(globalThis, 'browser');
      vi.stubGlobal('browser', ctx.browser);
      try {
        return listener(message, sender);
      } finally {
        vi.stubGlobal('browser', previous);
      }
    };
  });
}

describe('Happy path: the popup asks background.ts for its files once', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost({ fakeTimers: true });
  });

  afterEach(() => {
    teardownHost({ fakeTimers: true });
  });

  it('keeps the attached file when the configuration query refetches', async () => {
    const bg = stubContext(host);
    await import('../../background');
    await attachAndOpenPopup(host, bg, {
      id: 1,
      name: 'report.pdf',
      data: new Blob(['contents']),
    });
    runListenersInOwnContext(bg);

    const popup = stubContext(host, 'popup');
    const { files, requestFiles } = usePopupFileList();
    const attached = [{ id: 1, name: 'report.pdf', data: expect.any(Blob) }];

    // First run of the configuration query, as on mount.
    requestFiles();
    await vi.advanceTimersByTimeAsync(0);
    expect(files.value).toEqual(attached);

    // Refetch, as on window focus. background.ts has emptied its queue.
    requestFiles();
    await vi.advanceTimersByTimeAsync(0);

    expect(files.value).toEqual(attached);
    expect(popup.browser.runtime.onMessage.addListener).toHaveBeenCalledTimes(
      1
    );
    const popupReadyCalls = (
      popup.browser.runtime.sendMessage as ReturnType<typeof vi.fn>
    ).mock.calls.filter(([msg]) => msg?.type === 'POPUP_READY');
    expect(popupReadyCalls).toHaveLength(1);
    const fileListCalls = (
      bg.browser.runtime.sendMessage as ReturnType<typeof vi.fn>
    ).mock.calls.filter(([msg]) => msg?.type === 'FILE_LIST');
    expect(fileListCalls).toHaveLength(1);
  });
});
