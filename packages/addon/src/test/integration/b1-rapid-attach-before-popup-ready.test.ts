/**
 * B1 — Two rapid, separate `onFileUpload` bursts can silently lose files to a
 * popup that already drained the queue.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #B1 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §B1. See README.md for the
 * regression-test contract these specs follow.
 *
 * Mechanism (background.ts): onFileUpload pushes to `uploadInfoQueue` and
 * (re)arms a 250ms `popupTimer` -> `openUnifiedPopup()`. `POPUP_READY` sends
 * the ENTIRE queue as one `FILE_LIST` and unconditionally clears it -- no
 * per-batch id, no ack. If a second burst lands after the popup already
 * drained the queue once, those files sit unread: the "popup already open"
 * guard blocks a second popup from opening to re-deliver them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeWindow,
  resolveNextWindowCreate,
  type FakeHost,
} from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('B1: rapid onFileUpload bursts drop a second batch silently', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost({ fakeTimers: true });
  });

  afterEach(() => {
    teardownHost({ fakeTimers: true });
  });

  it('CONFIRMED BUG: second onFileUpload burst after popup already drained the queue is lost', async () => {
    const bg = stubContext(host);
    await import('../../background');

    // First burst: one file attached, triggers popupTimer.
    const firstUpload = bg.triggerFileUpload({
      id: 1,
      name: 'first.txt',
      data: new Blob(['a']),
    });

    // Let the 250ms popupTimer fire, invoking openUnifiedPopup().
    await vi.advanceTimersByTimeAsync(250);

    // openUnifiedPopup() is now awaiting browser.windows.create(). Resolve it
    // so popupWindowId gets set and the popup is considered "open".
    const popupWindow = resolveNextWindowCreate(host);
    expect(popupWindow).not.toBeNull();

    // Let any pending microtasks (popupWindowId assignment) settle.
    await Promise.resolve();
    await Promise.resolve();

    // Popup announces it's ready — background sends FILE_LIST with the
    // queue (file 1) and clears the queue.
    host.createContext('popup');
    await bg.deliverMessage({ type: 'POPUP_READY' });

    // Confirm background sent FILE_LIST containing exactly file 1, and that
    // sendMessage was actually invoked (fan-out to popup context).
    expect(bg.browser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FILE_LIST',
        files: expect.arrayContaining([
          expect.objectContaining({ id: 1, name: 'first.txt' }),
        ]),
      })
    );

    // --- Second burst arrives while the popup is still open/uploading ---
    const secondUpload = bg.triggerFileUpload({
      id: 2,
      name: 'second.txt',
      data: new Blob(['b']),
    });

    // Advance past the second popupTimer window. openUnifiedPopup() runs
    // again but should hit the "popup already open" guard (popupWindowId is
    // still set) and exit without notifying anyone about file 2.
    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    // THE BUG: no second FILE_LIST is ever sent for file 2. Background never
    // told the (already-open) popup that a new file arrived.
    const fileListCalls = (
      bg.browser.runtime.sendMessage as ReturnType<typeof vi.fn>
    ).mock.calls.filter(([msg]) => msg?.type === 'FILE_LIST');
    expect(fileListCalls).toHaveLength(1); // only the first batch was ever delivered
    expect(
      fileListCalls.some(([msg]) =>
        msg.files.some((f: any) => f.id === 2)
      )
    ).toBe(false); // file 2 was never included in any FILE_LIST

    // File 2's promise is left pending in uploadPromiseMap with no consumer.
    // It eventually gets rejected only when the popup closes (see B2/B4),
    // which is a misleading "popup closed prematurely" error rather than
    // an accurate "your file was silently dropped" error — reproduced here:
    closeWindow(host, popupWindow!.id);

    // The FIRST upload's promise had already been resolved-or-lost with the
    // popup context (not exercised further in this narrowly-scoped spec —
    // see B2 for close-mid-upload behavior). What matters for B1 is that the
    // second upload's promise rejects with the generic, misleading message,
    // never having been told its file was actually silently dropped from an
    // undelivered queue.
    await expect(secondUpload).rejects.toThrow(
      'Popup window was closed prematurely.'
    );

    // Cleanup: the first upload promise is also pending; reject-all clears it
    // via the same close event, so it too rejects (documented for completeness,
    // not the focus of this spec).
    await expect(firstUpload).rejects.toThrow(
      'Popup window was closed prematurely.'
    );
  });
});
