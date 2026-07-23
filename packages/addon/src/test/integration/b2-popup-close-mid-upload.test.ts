/**
 * B2 — Popup closed mid-upload leaves orphaned server-side item, no client
 * record; the AbortController created in background.ts is never wired to
 * the popup's actual network upload.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #B2 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §B2.
 *
 * This spec verifies the CLIENT-SIDE half of the finding, which is fully
 * code-confirmable without a live server: the `AbortController` background
 * creates per-file in `onFileUpload` is stored in `uploadPromiseMap` and
 * `.abort()`-ed by `rejectAllInQueue()` on window close, but NOTHING in the
 * background→popup message protocol (FILE_LIST) ever forwards that
 * AbortController's `signal` to the popup, and the popup's own upload code
 * (`useUploadAndShare.ts`/`folder-store.ts`) never checks for or listens to
 * any abort signal at all. So aborting it is a no-op from the network's
 * perspective -- confirmed here by showing the abort() call happens exactly
 * once per pending upload, but no signal ever crosses the FILE_LIST message
 * boundary to the popup context.
 *
 * The SERVER-SIDE half (does the backend actually persist the item after
 * the client window is destroyed) is explicitly a "needs live test" item
 * and is NOT claimed as covered by this spec -- see the bug report and the
 * Tier 2/3 sections of ADDON-INTEGRATION-TEST-ENV-PLAN-2026-07-22.md.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeWindow,
  resolveNextWindowCreate,
  type FakeHost,
} from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('B2: popup close mid-upload aborts background bookkeeping but not the network request', () => {
  let host: FakeHost;
  let abortSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    host = setupHost({ fakeTimers: true });
    abortSpy = vi.fn();
  });

  afterEach(() => {
    teardownHost({ fakeTimers: true });
  });

  it('CONFIRMED BUG: window close aborts the background AbortController, but the FILE_LIST payload sent to the popup never included that signal', async () => {
    // Spy on the real AbortController's prototype.abort to observe exactly
    // how many times background.ts's own bookkeeping-only controller gets
    // aborted, without needing to reach into module internals.
    const originalAbort = AbortController.prototype.abort;
    AbortController.prototype.abort = function (...args) {
      abortSpy();
      return originalAbort.apply(this, args as []);
    };

    try {
      const bg = stubContext(host);
      await import('../../background');

      const upload = bg.triggerFileUpload({
        id: 1,
        name: 'file.txt',
        data: new Blob(['x']),
      });

      await vi.advanceTimersByTimeAsync(250);
      const popupWindow = resolveNextWindowCreate(host);
      await Promise.resolve();
      await Promise.resolve();

      // Popup announces ready; background sends FILE_LIST.
      await bg.deliverMessage({ type: 'POPUP_READY' });

      const fileListCall = (
        bg.browser.runtime.sendMessage as ReturnType<typeof vi.fn>
      ).mock.calls.find(([msg]) => msg?.type === 'FILE_LIST');
      expect(fileListCall).toBeDefined();

      // THE BUG, part 1: the FILE_LIST payload's file entries are plain
      // {id, name, data} -- no AbortController/signal is ever attached or
      // forwarded to the popup. Confirms the popup has structurally no way
      // to observe an abort even if it wanted to.
      const [fileListMsg] = fileListCall!;
      for (const file of fileListMsg.files) {
        expect(file).not.toHaveProperty('signal');
        expect(file).not.toHaveProperty('abortController');
        expect(Object.keys(file).sort()).toEqual(['data', 'id', 'name']);
      }

      // User closes the popup mid-upload (before ALL_UPLOADS_COMPLETE).
      expect(abortSpy).not.toHaveBeenCalled();
      closeWindow(host, popupWindow!.id);

      // THE BUG, part 2: background's rejectAllInQueue() DOES call
      // abortController.abort() on its own bookkeeping-only controller --
      // proving the abort mechanism exists and fires -- but this abort has
      // no real HTTP request/fetch attached to it anywhere in this process
      // (per the source review: folder-store.ts / useUploadAndShare.ts have
      // zero AbortController/signal usage). So from the network's point of
      // view, this abort() call is a no-op; a real popup's in-flight
      // fetch() would keep running to completion regardless.
      expect(abortSpy).toHaveBeenCalledTimes(1);

      // The background-side promise IS rejected (this part works correctly
      // -- it's purely the network-cancellation wiring that's missing).
      await expect(upload).rejects.toThrow(
        'Popup window was closed prematurely.'
      );
    } finally {
      AbortController.prototype.abort = originalAbort;
    }
  });
});
