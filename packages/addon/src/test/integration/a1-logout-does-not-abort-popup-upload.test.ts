/**
 * A1 — Logout in a web tab doesn't abort an upload already in flight in the
 * popup. See README.md for shared harness context.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #A1 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §A1.
 *
 * Mechanism (background.ts): the SIGN_OUT handler only calls menuLogout()
 * and CloudFileAccounts.unregisterProvider() -- it never touches
 * uploadInfoQueue/uploadPromiseMap/popupWindowId, and never messages an open
 * popup. This test proves that structurally: a pending mid-upload promise
 * survives SIGN_OUT untouched.
 *
 * (PopupView.vue's onMessage listener having no SIGN_OUT case is the popup
 * side of this same gap, checked directly against source below since the
 * .vue SFC isn't easily mounted headlessly in this harness.)
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

describe('A1: SIGN_OUT does not abort or notify an in-flight popup upload', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost({ fakeTimers: true });
  });

  afterEach(() => {
    teardownHost({ fakeTimers: true });
  });

  it('CONFIRMED BUG: an in-flight uploadPromiseMap entry survives SIGN_OUT untouched, and no message is sent to the popup', async () => {
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

    // THE BUG: the pending upload promise is completely unaffected -- SIGN_OUT
    // neither resolves nor rejects it. The user's in-flight upload from the
    // (now logged-out) session continues to completion using the popup's
    // still-valid in-memory session state.
    expect(settled).toBe(false);

    // Confirm SIGN_OUT's only observable side effects are exactly the two
    // documented in background.ts's handler -- nothing upload/popup-related.
    expect(bg.browser.CloudFileAccounts.unregisterProvider).toHaveBeenCalledTimes(
      1
    );
    // No message of any kind (e.g. a hypothetical "ABORT_UPLOAD" or
    // forwarded SIGN_OUT) was sent toward the popup window.
    expect(bg.browser.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('CONFIRMED BUG: PopupView.vue\'s runtime.onMessage listener has no SIGN_OUT case', () => {
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
    // ...but has no SIGN_OUT branch to flip a "session ended, stop
    // uploading" flag before the next uploadItem() call in the queue.
    expect(listenerBlock).not.toContain('SIGN_OUT');
  });
});
