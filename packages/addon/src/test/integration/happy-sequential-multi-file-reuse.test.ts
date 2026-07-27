/**
 * HAPPY PATH — a single popup session correctly handles two SEPARATE
 * attach-and-complete cycles in sequence (attach file 1, complete it, close
 * the popup; then attach file 2 as a fresh popup session). Proves the
 * background<->popup handshake (popupTimer/popupWindowId reset,
 * uploadInfoQueue/uploadPromiseMap bookkeeping) is correctly reusable
 * across sessions, not a one-shot fluke that only happens to work once.
 *
 * This is deliberately two SEPARATE popup sessions (not one popup handling
 * two files back-to-back mid-session) because that's what popupWindowId
 * being reset to null on windows.onRemoved actually models: each attach
 * that arrives after the previous popup fully closed gets its own popup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeWindow, type FakeHost } from './fakeThunderbirdHost';
import {
  attachAndOpenPopup,
  setupHost,
  stubContext,
  teardownHost,
} from './testHelpers';

describe('Happy path: sequential multi-file reuse across popup sessions', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost({ fakeTimers: true });
  });

  afterEach(() => {
    teardownHost({ fakeTimers: true });
  });

  it('completes file 1 in one popup session, then correctly opens a fresh popup and completes file 2', async () => {
    const bg = stubContext(host);
    await import('../../background');

    // --- Session 1: file 1 ---
    const { upload: upload1, popupWindow: popup1 } = await attachAndOpenPopup(
      host,
      bg,
      { id: 1, name: 'first.txt', data: new Blob(['a']) }
    );
    expect(popup1).not.toBeNull();

    await bg.deliverMessage({ type: 'POPUP_READY' });
    const firstFileListCall = (
      bg.browser.runtime.sendMessage as ReturnType<typeof vi.fn>
    ).mock.calls.find(([msg]) => msg?.type === 'FILE_LIST');
    expect(firstFileListCall![0].files).toEqual([
      { id: 1, name: 'first.txt', data: expect.any(Blob) },
    ]);

    await bg.deliverMessage({
      type: 'ALL_UPLOADS_COMPLETE',
      url: 'https://send.tb.pro/share/session-1-link',
      results: [{ originalId: 1 }],
    });
    await expect(upload1).resolves.toEqual({
      aborted: false,
      url: 'https://send.tb.pro/share/session-1-link',
    });

    // The popup closes once the share is done (matches shareComplete()'s
    // window.close() in useUploadAndShare.ts) -- this resets popupWindowId
    // so a NEW attach can open a fresh popup rather than being blocked by
    // the "popup already open" guard.
    closeWindow(host, popup1!.id);

    // --- Session 2: a completely separate later attach, file 2 ---
    const { upload: upload2, popupWindow: popup2 } = await attachAndOpenPopup(
      host,
      bg,
      { id: 2, name: 'second.txt', data: new Blob(['b']) }
    );
    // A genuinely new popup window was opened -- not blocked, not reused.
    expect(popup2).not.toBeNull();
    expect(popup2!.id).not.toBe(popup1!.id);

    await bg.deliverMessage({ type: 'POPUP_READY' });
    const fileListCalls = (
      bg.browser.runtime.sendMessage as ReturnType<typeof vi.fn>
    ).mock.calls.filter(([msg]) => msg?.type === 'FILE_LIST');
    // Two POPUP_READY deliveries total across both sessions -> two FILE_LIST
    // sends, and the second one contains ONLY file 2 (the queue was cleared
    // after session 1, so there's no stale carry-over from file 1).
    expect(fileListCalls).toHaveLength(2);
    expect(fileListCalls[1][0].files).toEqual([
      { id: 2, name: 'second.txt', data: expect.any(Blob) },
    ]);

    await bg.deliverMessage({
      type: 'ALL_UPLOADS_COMPLETE',
      url: 'https://send.tb.pro/share/session-2-link',
      results: [{ originalId: 2 }],
    });
    await expect(upload2).resolves.toEqual({
      aborted: false,
      url: 'https://send.tb.pro/share/session-2-link',
    });
  });
});
