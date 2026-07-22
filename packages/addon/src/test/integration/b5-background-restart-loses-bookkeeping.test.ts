/**
 * B5 [HIGH] — Background script restart mid-upload loses `uploadPromiseMap`;
 * the share link is still created server-side with zero notification to the
 * user.
 *
 * See ADDON-BUG-REPORTS-2026-07-22.md #B5 and
 * ADDON-SYNC-VERIFIED-FINDINGS-2026-07-21.md §B5.
 *
 * Mechanism under test (background.ts):
 *   - `uploadInfoQueue`, `uploadPromiseMap`, `popupWindowId` are plain
 *     module-scope variables with zero persistence to browser.storage.*.
 *   - A "background restart" is simulated here the only way it can be in a
 *     module system: `vi.resetModules()` + re-import `../../background`,
 *     which gives us a FRESH module instance with an EMPTY uploadPromiseMap
 *     -- exactly what a real non-persistent background page recycle would
 *     produce.
 *   - The `ALL_UPLOADS_COMPLETE` handler does an unconditional
 *     `uploadPromiseMap.has(id)` check per result (silently no-oping for an
 *     unknown id), but runs the `add-password` API call UNCONDITIONALLY
 *     afterward regardless of whether any promise was actually matched.
 *
 * This test proves: after simulating a restart, delivering an
 * ALL_UPLOADS_COMPLETE for an upload id from "before the restart" produces
 * NO resolved promise (because there's nothing to resolve in the new
 * instance) but STILL triggers the password-add API call for a
 * password-protected link -- i.e. the share is created successfully server
 * side with nobody in the (restarted) background context aware of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeHost } from './fakeThunderbirdHost';
import { setupHost, stubContext, teardownHost } from './testHelpers';

// api.call is used by background.ts's ALL_UPLOADS_COMPLETE handler for the
// add-password step. We spy on the shared api-store used by the app so we
// can assert it still gets called after a simulated restart.
import { useApiStore } from 'send-frontend/src/stores';

describe('B5: background restart mid-upload loses uploadPromiseMap bookkeeping', () => {
  let host: FakeHost;

  beforeEach(() => {
    host = setupHost();
  });

  afterEach(() => {
    teardownHost();
  });

  it('CONFIRMED BUG: a restarted background silently no-ops the promise resolution but still completes the add-password API call', async () => {
    // --- "Before restart" instance ---
    const bg = stubContext(host);
    await import('../../background');

    const upload = bg.triggerFileUpload({
      id: 42,
      name: 'important.txt',
      data: new Blob(['secret']),
    });
    // Keep the promise from being an unhandled rejection if the test ends
    // without it settling (it won't settle in THIS module instance at all,
    // which is exactly the bug -- attach a no-op catch to silence it).
    upload.catch(() => {});

    // --- Simulate a background page restart ---
    // A real non-persistent background page recycle destroys all in-memory
    // state and re-runs the top-level module code from scratch. The most
    // faithful simulation available in a module-based test harness is a
    // fresh module instance via resetModules() + re-import.
    vi.resetModules();
    const bgAfterRestart = stubContext(host, 'background-after-restart');
    await import('../../background');

    // Spy on the api.call the restarted instance will use for add-password.
    const { api } = useApiStore();
    const apiCallSpy = vi
      .spyOn(api, 'call')
      .mockResolvedValue({ success: true });

    // The upload "finishes" from the popup's perspective (it has no idea
    // the background restarted) and reports ALL_UPLOADS_COMPLETE for the
    // SAME originalId (42) that only the OLD, now-gone module instance's
    // uploadPromiseMap knew about.
    //
    // Source note: background.ts computes
    //   isPasswordProtected = !url.includes('#')
    // then only runs the add-password branch `if (!isPasswordProtected)` --
    // i.e. the branch actually runs when the URL DOES include a '#' hash
    // fragment (a passphrase embedded in the link). Use such a URL here to
    // exercise that branch, matching the ALL_UPLOADS_COMPLETE handler's
    // `url.split('share/')[1].split('#')` parsing.
    await bgAfterRestart.deliverMessage({
      type: 'ALL_UPLOADS_COMPLETE',
      url: 'https://send.tb.pro/share/abc123#somepassphrasehash',
      results: [{ originalId: 42 }],
    });

    // Let the fire-and-forget add-password branch's async work settle.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // THE BUG: the restarted instance's fresh uploadPromiseMap has no entry
    // for id 42 (it was in the old, destroyed instance), so the forEach body
    // silently no-ops -- there is no visible error, warning, or user
    // notification of any kind for the orphaned upload.
    //
    // But the add-password API call still runs UNCONDITIONALLY, regardless
    // of whether any promise was matched -- proving the share link is fully
    // created/finalized server-side with nobody in the (restarted)
    // background context the wiser.
    expect(apiCallSpy).toHaveBeenCalledWith(
      expect.stringContaining('add-password'),
      expect.objectContaining({ linkId: expect.any(String) }),
      'POST'
    );

    // The original upload promise (from before the restart) is left
    // permanently pending in a destroyed module instance -- it will never
    // resolve or reject. This is the "zero user notification" half of the
    // finding: Thunderbird's own cloudFile.onFileUpload promise (which the
    // OLD instance returned to Thunderbird) never settles, so Thunderbird
    // itself has no signal that the upload actually succeeded either.
    let settled = false;
    upload.then(
      () => (settled = true),
      () => (settled = true)
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    apiCallSpy.mockRestore();
  });
});
