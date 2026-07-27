/**
 * B3 — Check-then-act race in `openUnifiedPopup()`'s `popupWindowId` guard.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #B3 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §B3.
 *
 * Mechanism under test (background.ts, openUnifiedPopup()):
 *   if (uploadInfoQueue.length === 0 || popupWindowId) return;
 *   const popup = await browser.windows.create({...});
 *   popupWindowId = popup.id;
 *
 * The guard is read synchronously but `popupWindowId` is only WRITTEN after
 * the `await browser.windows.create()` resolves. If a second
 * `openUnifiedPopup()` invocation begins while the first's
 * `windows.create()` call is still pending, it reads `popupWindowId` as
 * still null/undefined and also calls `windows.create()` — opening two
 * popups for what should be one unified upload session.
 *
 * This harness's fake `windows.create()` returns a controllable, unresolved
 * Promise (see resolveNextWindowCreate) specifically so tests can force this
 * exact interleaving deterministically, which is impossible to do reliably
 * against a real Thunderbird window manager.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveNextWindowCreate,
  type FakeHost,
} from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

describe('B3: openUnifiedPopup() check-then-act race can open two popups', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost({ fakeTimers: true });
  });

  afterEach(() => {
    teardownHost({ fakeTimers: true });
  });

  it('CONFIRMED BUG: two near-simultaneous onFileUpload events can both pass the popupWindowId guard', async () => {
    const bg = stubContext(host);
    await import('../../background');

    // First file triggers the first popupTimer -> openUnifiedPopup() call.
    bg.triggerFileUpload({ id: 1, name: 'a.txt', data: new Blob(['a']) });
    await vi.advanceTimersByTimeAsync(250);

    // At this point background's first openUnifiedPopup() invocation has
    // read `popupWindowId` as null, passed the guard, and is now awaiting
    // browser.windows.create() — that await has NOT resolved yet (we
    // haven't called resolveNextWindowCreate). This is the exact race
    // window described in the bug report.
    expect(bg.browser.windows.create).toHaveBeenCalledTimes(1);

    // A second file attaches WHILE the first windows.create() is still
    // pending. Its onFileUpload handler clears/re-arms popupTimer (250ms),
    // so simulate that timer firing too, calling openUnifiedPopup() again
    // BEFORE the first call's popupWindowId assignment has happened.
    bg.triggerFileUpload({ id: 2, name: 'b.txt', data: new Blob(['b']) });
    await vi.advanceTimersByTimeAsync(250);

    // THE BUG: because popupWindowId is still null/undefined (the first
    // windows.create() hasn't resolved), the guard `if (... || popupWindowId)
    // return;` does not block this second invocation, and background calls
    // browser.windows.create() a second time.
    expect(bg.browser.windows.create).toHaveBeenCalledTimes(2);

    // Now let both windows.create() calls resolve, in order, and confirm
    // two separate windows were actually created/tracked.
    const win1 = resolveNextWindowCreate(host);
    const win2 = resolveNextWindowCreate(host);
    await Promise.resolve();
    await Promise.resolve();

    expect(win1).not.toBeNull();
    expect(win2).not.toBeNull();
    expect(win1!.id).not.toBe(win2!.id);
    // Confirms this repo's fix target: popupWindowId should be set
    // synchronously (a 'pending' sentinel) BEFORE the await, which would
    // make the second call see a truthy guard and skip windows.create()
    // entirely -- windows.create would then only ever be called once.
  });
});
