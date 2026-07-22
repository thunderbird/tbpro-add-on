/**
 * B4 — New file attached while popup already open is silently dropped, not
 * merged into the existing upload session.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #B4 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §B4.
 *
 * This is the mirror case of B1 from a different trigger path: rather than
 * two bursts racing to be the FIRST batch, here the popup has already fully
 * initialized (POPUP_READY answered) and is idle/mid-upload when a fresh
 * `onFileUpload` fires. `openUnifiedPopup()`'s guard treats "popup already
 * open" as "nothing to do", so the new file is queued but nobody ever tells
 * the open popup about it — and `PopupView.vue`'s `files.value =
 * message.files` is a plain overwrite even if a second FILE_LIST were ever
 * sent (which this test also demonstrates never happens).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeWindow,
  resolveNextWindowCreate,
  type FakeHost,
} from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('B4: file attached while popup already open is dropped, not merged', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost({ fakeTimers: true });
  });

  afterEach(() => {
    teardownHost({ fakeTimers: true });
  });

  it('CONFIRMED BUG: openUnifiedPopup() no-ops for a file attached after the popup is fully open, and no second FILE_LIST is ever sent', async () => {
    const bg = stubContext(host);
    await import('../../background');

    // First file: full happy-path popup open + POPUP_READY round trip.
    const firstUpload = bg.triggerFileUpload({
      id: 1,
      name: 'first.txt',
      data: new Blob(['a']),
    });
    await vi.advanceTimersByTimeAsync(250);
    const popupWindow = resolveNextWindowCreate(host);
    await Promise.resolve();
    await Promise.resolve();

    await bg.deliverMessage({ type: 'POPUP_READY' });
    (bg.browser.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();

    // Popup is now fully open, initialized, and (from the user's
    // perspective) may be mid-upload. A second file gets attached from
    // another compose window while this popup is still on screen.
    const secondUpload = bg.triggerFileUpload({
      id: 2,
      name: 'second.txt',
      data: new Blob(['b']),
    });
    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    // THE BUG: openUnifiedPopup()'s guard (`popupWindowId` truthy) causes it
    // to return early -- browser.windows.create() is NOT called again...
    expect(bg.browser.windows.create).toHaveBeenCalledTimes(1); // still just the original popup

    // ...AND critically, no message is sent to notify the already-open
    // popup that a new file has arrived. There is no "merge into open
    // popup" code path at all in this repo.
    expect(bg.browser.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FILE_LIST' })
    );

    // File 2 sits in uploadInfoQueue with a pending, un-actioned promise.
    // The only thing that will ever settle it is the popup eventually
    // closing (see B2/B1) -- surfacing the same misleading generic error
    // rather than any indication the file was silently dropped from an
    // active session.
    closeWindow(host, popupWindow!.id);

    await expect(secondUpload).rejects.toThrow(
      'Popup window was closed prematurely.'
    );
    // File 1's promise (never resolved via ALL_UPLOADS_COMPLETE in this
    // narrowly-scoped spec) is also swept up by the same close-triggered
    // rejectAllInQueue() call; assert on it too so it isn't left as an
    // unhandled rejection.
    await expect(firstUpload).rejects.toThrow(
      'Popup window was closed prematurely.'
    );
  });
});
