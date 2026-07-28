/**
 * A1 — Logout in a web tab now aborts an upload already in flight in the
 * popup. See README.md for shared harness context.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #A1 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §A1.
 *
 * Fix (background.ts): the SIGN_OUT handler now (1) rejects every entry in
 * uploadPromiseMap via rejectAllInQueue(), (2) closes the popup window if
 * one is open, and (3) broadcasts a SIGN_OUT message to other contexts so
 * they can flip their UI state. The popup side (PopupView.vue's
 * onMessage listener) now also handles SIGN_OUT by clearing its pending
 * files list.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveNextWindowCreate, type FakeHost } from './fakeThunderbirdHost';
import { ADDON_ROOT, setupHost, stubContext, teardownHost } from './testHelpers';

const POPUP_VIEW_PATH = resolve(
  ADDON_ROOT,
  'node_modules/send-frontend/src/apps/send/views/PopupView.vue'
);

describe('A1: SIGN_OUT aborts in-flight uploads and notifies the popup', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost({ fakeTimers: true });
  });

  afterEach(() => {
    teardownHost({ fakeTimers: true });
  });

  it('FIXED: an in-flight uploadPromiseMap entry is rejected by SIGN_OUT, and a SIGN_OUT message is broadcast', async () => {
    const bg = stubContext(host);
    await import('../../background');

    // Open a popup and get it mid-upload (POPUP_READY has fired, upload
    // promise is pending in uploadPromiseMap -- this is the exact state an
    // in-flight upload would be in when a SIGN_OUT arrives).
    const upload = bg.triggerFileUpload({
      id: 7,
      name: 'mid-upload.txt',
      data: new Blob(['data']),
    });
    upload.catch(() => {}); // silence any eventual rejection for this spec

    await vi.advanceTimersByTimeAsync(250);
    resolveNextWindowCreate(host);
    await Promise.resolve();
    await Promise.resolve();
    await bg.deliverMessage({ type: 'POPUP_READY' });

    (bg.browser.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();
    (bg.browser.CloudFileAccounts.unregisterProvider as ReturnType<
      typeof vi.fn
    >).mockClear();

    let settled = false;
    upload.then(
      () => (settled = true),
      () => (settled = true)
    );

    // A web tab's UserMenu.vue "Logout" click has posted SIGN_OUT through
    // the bridge, which lands here as background's onMessage receives it.
    await bg.deliverMessage({ type: 'SIGN_OUT' });
    await Promise.resolve();
    await Promise.resolve();

    // FIX: SIGN_OUT now rejects every pending entry in uploadPromiseMap
    // via rejectAllInQueue() -- the upload promise is no longer untouched.
    expect(settled).toBe(true);

    // SIGN_OUT's other side effects (unchanged from the original handler):
    // the cloud-file provider must still be unregistered once, so a
    // signed-out profile matches the fresh-install baseline.
    expect(bg.browser.CloudFileAccounts.unregisterProvider).toHaveBeenCalledTimes(
      1
    );
    // FIX: SIGN_OUT now also broadcasts a SIGN_OUT message out to other
    // contexts (popup/web tab) so they can flip their UI state.
    expect(bg.browser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SIGN_OUT' })
    );
    // FIX: SIGN_OUT closes the open upload popup via browser.windows.remove().
    // The fake host now stubs windows.remove (real Thunderbird provides it),
    // so this asserts the popup-close path actually runs -- previously the
    // call threw "windows.remove is not a function" and was silently swallowed
    // by the handler's try/catch, giving a false pass.
    expect(bg.browser.windows.remove).toHaveBeenCalledTimes(1);
  });

  it('FIXED: PopupView.vue\'s runtime.onMessage listener handles SIGN_OUT', () => {
    const source = readFileSync(POPUP_VIEW_PATH, 'utf-8');

    // Isolate the onMessage listener registered in initialize().
    const listenerStart = source.indexOf(
      'browser.runtime.onMessage.addListener(async (message) => {'
    );
    expect(listenerStart).toBeGreaterThan(-1);
    // The listener body is short; grab a bounded slice after it for the check
    // rather than trying to balance braces.
    const listenerBlock = source.slice(listenerStart, listenerStart + 300);

    // Confirms it does handle FILE_LIST (the one case that exists today)...
    expect(listenerBlock).toContain('FILE_LIST');
    // ...and now DOES have a SIGN_OUT branch to clear pending uploads
    // before the next uploadItem() call in the queue.
    expect(listenerBlock).toContain('SIGN_OUT');
  });
});
